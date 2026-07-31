import { FileSearchOutlined, HistoryOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Spin, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { WorkflowQueueItem } from '@jsams/shared-types';
import {
  JsaListFilters,
  JsaListRibbon,
  type JsaListSearchField,
  uniqueJsaListOptions,
} from './jsa-list-controls';
import { PublishedJsaPage } from './published-jsa-page';
import { useRigContext } from './rig-context';
import { workflowApi } from './workflow-api';
import './published-jsa-page.css';

const labels = {
  approvals: 'Needs Approval',
  pending: 'Pending JSA',
  rejected: 'Rejected JSA',
  published: 'Published JSA',
};

const updatedAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
  timeStyle: 'short',
});

export function WorkflowQueuePage({ kind }: { kind: keyof typeof labels }) {
  if (kind === 'published') return <PublishedJsaPage />;
  return <StandardWorkflowQueue kind={kind} />;
}

function StandardWorkflowQueue({ kind }: { kind: Exclude<keyof typeof labels, 'published'> }) {
  const navigate = useNavigate();
  const { selectedRigId } = useRigContext();
  const [selectedJsaId, setSelectedJsaId] = useState<string>();
  const [department, setDepartment] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [searchField, setSearchField] = useState<JsaListSearchField>('ALL');
  const query = useQuery({
    queryKey: ['workflow-queue', kind, selectedRigId ?? 'all'],
    queryFn: () => workflowApi.queue(kind, selectedRigId),
    refetchOnWindowFocus: false,
  });
  const departmentOptions = useMemo(
    () =>
      uniqueJsaListOptions(
        (query.data ?? []).map((item) => ({
          value: item.departmentCode,
          label: `${item.departmentCode} — ${item.departmentName}`,
        })),
      ),
    [query.data],
  );
  const filteredItems = useMemo(() => {
    const term = keyword.trim().toLocaleLowerCase();
    return (query.data ?? []).filter((item) => {
      if (department !== 'all' && item.departmentCode !== department) return false;
      if (!term) return true;
      const fields: Partial<Record<JsaListSearchField, string>> = {
        JSA_NUMBER: item.jsaNumber,
        JOB_TITLE: item.jobTitle ?? '',
      };
      return searchField === 'ALL'
        ? Object.values(fields).some((value) => value.toLocaleLowerCase().includes(term))
        : (fields[searchField] ?? '').toLocaleLowerCase().includes(term);
    });
  }, [department, keyword, query.data, searchField]);
  const selectedItem = filteredItems.find((item) => item.jsaId === selectedJsaId);
  const columns = useMemo<ColumnsType<WorkflowQueueItem>>(
    () => [
      {
        title: 'JSA No.',
        dataIndex: 'jsaNumber',
        width: 190,
        sorter: (left, right) => left.jsaNumber.localeCompare(right.jsaNumber),
      },
      {
        title: 'Description',
        dataIndex: 'jobTitle',
        width: 300,
        ellipsis: true,
        render: (value) => value || '—',
      },
      {
        title: 'Rig',
        width: 170,
        ellipsis: true,
        render: (_, item) => item.rigName,
      },
      {
        title: 'Department',
        width: 170,
        ellipsis: true,
        render: (_, item) => item.departmentName,
      },
      {
        title: 'Status',
        dataIndex: 'versionStatus',
        width: 130,
        render: (value) => <Tag>{value}</Tag>,
      },
      {
        title: 'Current step',
        dataIndex: 'currentStepName',
        width: 190,
        ellipsis: true,
        render: (value) => value || '—',
      },
      {
        title: 'Updated',
        dataIndex: 'updatedAt',
        width: 170,
        render: (value) => updatedAtFormatter.format(new Date(value)),
      },
    ],
    [],
  );
  const openWorkflow = () => {
    if (selectedItem) navigate(`/jsa/${selectedItem.jsaId}/workflow`);
  };
  const openJsa = () => {
    if (selectedItem) navigate(`/jsa/${selectedItem.jsaId}/draft`);
  };

  return (
    <main className="published-jsa-page">
      <Typography.Title level={1} className="published-jsa-sr-title">
        {labels[kind]}
      </Typography.Title>
      <JsaListRibbon
        ariaLabel={`${labels[kind]} operations`}
        actions={[
          ...(kind === 'approvals'
            ? [
                {
                  key: 'review',
                  icon: <FileSearchOutlined />,
                  label: 'Review JSA',
                  disabled: !selectedItem,
                  onClick: openWorkflow,
                },
              ]
            : []),
          {
            key: 'view',
            icon: <FileSearchOutlined />,
            label: 'View JSA',
            disabled: !selectedItem,
            onClick: openJsa,
          },
          {
            key: 'history',
            icon: <HistoryOutlined />,
            label: 'Approval history',
            disabled: !selectedItem,
            onClick: openWorkflow,
          },
        ]}
      />
      <section className="published-list" aria-label={`${labels[kind]} list`}>
        <JsaListFilters
          department={department}
          departmentOptions={departmentOptions}
          keyword={keyword}
          searchField={searchField}
          onDepartmentChange={setDepartment}
          onKeywordChange={setKeyword}
          onSearchFieldChange={setSearchField}
        />
        {query.isLoading ? (
          <div className="published-list-feedback">
            <Spin aria-label={`Loading ${labels[kind]}`} />
          </div>
        ) : query.error ? (
          <Alert
            type="error"
            showIcon
            message={`${labels[kind]} could not be loaded`}
            action={<Button onClick={() => void query.refetch()}>Retry</Button>}
          />
        ) : (
          <div className="published-table-scroll">
            <Table<WorkflowQueueItem>
              className="published-table"
              rowKey="instanceId"
              size="small"
              tableLayout="fixed"
              dataSource={filteredItems}
              columns={columns}
              pagination={{ pageSize: 25, showSizeChanger: false }}
              rowSelection={{
                type: 'radio',
                selectedRowKeys: selectedItem ? [selectedItem.instanceId] : [],
                onChange: (_, rows) => setSelectedJsaId(rows[0]?.jsaId),
                columnWidth: 42,
              }}
              onRow={(item) => ({
                onClick: () => setSelectedJsaId(item.jsaId),
                onDoubleClick: () =>
                  navigate(
                    kind === 'approvals'
                      ? `/jsa/${item.jsaId}/workflow`
                      : `/jsa/${item.jsaId}/draft`,
                  ),
              })}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      query.data?.length
                        ? `No ${labels[kind]} matches the current filters`
                        : `No ${labels[kind]} is available`
                    }
                  />
                ),
              }}
            />
          </div>
        )}
      </section>
    </main>
  );
}
