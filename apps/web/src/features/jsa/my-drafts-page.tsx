import { EditOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Spin, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { JsaDraftListItem } from '@jsams/shared-types';
import type { ApiClientError } from '../../services/api-client';
import { jsaApi } from './jsa-api';
import {
  JsaListFilters,
  JsaListRibbon,
  type JsaListSearchField,
  uniqueJsaListOptions,
} from './jsa-list-controls';
import { useRigContext } from './rig-context';
import './published-jsa-page.css';

const updatedAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
  timeStyle: 'short',
});

export function MyDraftsPage() {
  const navigate = useNavigate();
  const { selectedRigId } = useRigContext();
  const [selectedJsaId, setSelectedJsaId] = useState<string>();
  const [department, setDepartment] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [searchField, setSearchField] = useState<JsaListSearchField>('all');
  const drafts = useQuery({
    queryKey: ['jsa-drafts', 'mine', selectedRigId ?? 'all'],
    queryFn: () => jsaApi.myDrafts(selectedRigId),
    refetchOnWindowFocus: false,
  });
  const departmentOptions = useMemo(
    () =>
      uniqueJsaListOptions(
        (drafts.data ?? []).map((item) => ({
          value: item.departmentCode,
          label: `${item.departmentCode} — ${item.departmentName}`,
        })),
      ),
    [drafts.data],
  );
  const filteredItems = useMemo(() => {
    const term = keyword.trim().toLocaleLowerCase();
    return (drafts.data ?? []).filter((item) => {
      if (department !== 'all' && item.departmentCode !== department) return false;
      if (!term) return true;
      const fields: Record<Exclude<JsaListSearchField, 'all'>, string> = {
        number: item.jsaNumber,
        job: item.jobTitle ?? '',
        rig: `${item.rigCode} ${item.rigName}`,
        department: `${item.departmentCode} ${item.departmentName}`,
        status: item.versionStatus,
      };
      return searchField === 'all'
        ? Object.values(fields).some((value) => value.toLocaleLowerCase().includes(term))
        : fields[searchField].toLocaleLowerCase().includes(term);
    });
  }, [department, drafts.data, keyword, searchField]);
  const selectedItem = filteredItems.find((item) => item.jsaId === selectedJsaId);
  const columns = useMemo<ColumnsType<JsaDraftListItem>>(
    () => [
      {
        title: 'Temporary Number',
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
        render: (value) => <Tag color={value === 'RETURNED' ? 'orange' : 'default'}>{value}</Tag>,
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
  const openSelected = () => {
    if (selectedItem) navigate(`/jsa/${selectedItem.jsaId}/draft`);
  };

  return (
    <main className="published-jsa-page">
      <Typography.Title level={1} className="published-jsa-sr-title">
        My Drafts
      </Typography.Title>
      <JsaListRibbon
        ariaLabel="My Drafts operations"
        actions={[
          {
            key: 'edit',
            icon: <EditOutlined />,
            label: 'Continue editing',
            disabled: !selectedItem,
            onClick: openSelected,
          },
        ]}
      />
      <section className="published-list" aria-label="My Drafts list">
        <JsaListFilters
          department={department}
          departmentOptions={departmentOptions}
          keyword={keyword}
          searchField={searchField}
          onDepartmentChange={setDepartment}
          onKeywordChange={setKeyword}
          onSearchFieldChange={setSearchField}
        />
        {drafts.isLoading ? (
          <div className="published-list-feedback">
            <Spin aria-label="Loading My Drafts" />
          </div>
        ) : drafts.error ? (
          <Alert
            type="error"
            showIcon
            message="My Drafts could not be loaded"
            description={(drafts.error as ApiClientError).message}
            action={<Button onClick={() => void drafts.refetch()}>Retry</Button>}
          />
        ) : (
          <div className="published-table-scroll">
            <Table<JsaDraftListItem>
              className="published-table"
              rowKey="jsaId"
              size="small"
              tableLayout="fixed"
              dataSource={filteredItems}
              columns={columns}
              pagination={{ pageSize: 25, showSizeChanger: false }}
              rowSelection={{
                type: 'radio',
                selectedRowKeys: selectedItem ? [selectedItem.jsaId] : [],
                onChange: (keys) => setSelectedJsaId(String(keys[0])),
                columnWidth: 42,
              }}
              onRow={(item) => ({
                onClick: () => setSelectedJsaId(item.jsaId),
                onDoubleClick: () => navigate(`/jsa/${item.jsaId}/draft`),
              })}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      drafts.data?.length
                        ? 'No Draft or Returned JSA matches the current filters'
                        : 'You have no Draft or Returned JSA'
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
