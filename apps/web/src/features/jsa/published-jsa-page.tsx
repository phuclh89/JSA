import {
  FileAddOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  PrinterOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Empty, Modal, Spin, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { WorkflowQueueItem } from '@jsams/shared-types';
import { jsaApi } from './jsa-api';
import { JsaCreateModal } from './jsa-create-page';
import {
  JsaListFilters,
  JsaListRibbon,
  type JsaListSearchField,
  uniqueJsaListOptions,
} from './jsa-list-controls';
import { useRigContext } from './rig-context';
import { workflowApi } from './workflow-api';
import './published-jsa-page.css';
import { versioningApi } from './versioning-api';
import { VersionHistoryModal } from './version-history-modal';
import type { ApiClientError } from '../../services/api-client';

const publishedDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
  timeStyle: 'short',
});

export function PublishedJsaPage() {
  const navigate = useNavigate();
  const { selectedRigId } = useRigContext();
  const [selectedJsaId, setSelectedJsaId] = useState<string>();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const queryClient = useQueryClient();
  const [department, setDepartment] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [searchField, setSearchField] = useState<JsaListSearchField>('ALL');
  const queue = useQuery({
    queryKey: ['workflow-queue', 'published', selectedRigId ?? 'all'],
    queryFn: () => workflowApi.queue('published', selectedRigId),
    refetchOnWindowFocus: false,
  });
  const capabilities = useQuery({
    queryKey: ['jsa-capabilities'],
    queryFn: jsaApi.capabilities,
  });
  const versioningCapabilities = useQuery({
    queryKey: ['jsa-versioning-capabilities'],
    queryFn: versioningApi.capabilities,
  });
  const checkout = useMutation({
    mutationFn: (id: string) => versioningApi.checkout(id),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['workflow-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['jsa-drafts'] });
      void queryClient.invalidateQueries({ queryKey: ['jsa-navigation-counts'] });
      message.success(
        result.matrixChanged
          ? 'Working Version created. Risk reassessment is required for the new Matrix.'
          : 'Working Version created from the Current Published Version.',
      );
      navigate(`/jsa/${result.jsaId}/draft`);
    },
    onError: (error) => message.error((error as ApiClientError).message),
  });

  const departmentOptions = useMemo(
    () =>
      uniqueJsaListOptions(
        (queue.data ?? []).map((item) => ({
          value: item.departmentCode,
          label: `${item.departmentCode} — ${item.departmentName}`,
        })),
      ),
    [queue.data],
  );
  const filteredItems = useMemo(() => {
    const term = keyword.trim().toLocaleLowerCase();
    return (queue.data ?? []).filter((item) => {
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
  }, [department, keyword, queue.data, searchField]);
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
        width: 340,
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
        width: 110,
        render: () => <Tag color="green">Published</Tag>,
      },
      {
        title: 'Approval Date',
        width: 170,
        render: (_, item) =>
          publishedDateFormatter.format(new Date(item.publishedAt ?? item.updatedAt)),
      },
      {
        title: 'Last Approver',
        dataIndex: 'publishedByUsername',
        width: 150,
        render: (value) => value || '—',
      },
    ],
    [],
  );

  const openSelected = (destination: 'view' | 'history' | 'print') => {
    if (!selectedItem) return;
    if (destination === 'view') {
      navigate(`/jsa/${selectedItem.jsaId}/draft?source=current`);
    } else if (destination === 'history') {
      setHistoryOpen(true);
    } else {
      window.open(`/jsa/${selectedItem.jsaId}/print`, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <main className="published-jsa-page">
      <Typography.Title level={1} className="published-jsa-sr-title">
        Published JSA
      </Typography.Title>

      <JsaListRibbon
        ariaLabel="Published JSA operations"
        actions={[
          {
            key: 'update',
            icon: <SyncOutlined />,
            label: checkout.isPending ? 'Starting update' : 'Update JSA',
            disabled: !selectedItem || !versioningCapabilities.data?.update || checkout.isPending,
            onClick: () =>
              selectedItem &&
              Modal.confirm({
                title: 'Start Update',
                content:
                  'A new Working Version will be checked out from the exact Current Published Version. Current remains operational.',
                okText: 'Start Update',
                onOk: () => checkout.mutateAsync(selectedItem.jsaId),
              }),
          },
          {
            key: 'create',
            icon: <FileAddOutlined />,
            label: 'Create JSA',
            disabled: !capabilities.data?.create,
            onClick: () => setCreateModalOpen(true),
          },
          {
            key: 'view',
            icon: <FileSearchOutlined />,
            label: 'View JSA',
            disabled: !selectedItem,
            onClick: () => openSelected('view'),
          },
          {
            key: 'history',
            icon: <HistoryOutlined />,
            label: 'Approval history',
            disabled: !selectedItem,
            onClick: () => openSelected('history'),
          },
          {
            key: 'print',
            icon: <PrinterOutlined />,
            label: 'Print JSA',
            disabled: !selectedItem,
            onClick: () => openSelected('print'),
          },
        ]}
      />

      <section className="published-list" aria-label="Published JSA list">
        <JsaListFilters
          department={department}
          departmentOptions={departmentOptions}
          keyword={keyword}
          searchField={searchField}
          onDepartmentChange={setDepartment}
          onKeywordChange={setKeyword}
          onSearchFieldChange={setSearchField}
        />

        {queue.isLoading ? (
          <div className="published-list-feedback">
            <Spin aria-label="Loading Published JSA" />
          </div>
        ) : queue.error ? (
          <Alert
            type="error"
            showIcon
            message="Published JSA could not be loaded"
            action={<Button onClick={() => void queue.refetch()}>Retry</Button>}
          />
        ) : (
          <div className="published-table-scroll">
            <Table<WorkflowQueueItem>
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
                      queue.data?.length
                        ? 'No Published JSA matches the current filters'
                        : 'No Published JSA is available'
                    }
                  />
                ),
              }}
            />
          </div>
        )}
      </section>
      <JsaCreateModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} />
      <VersionHistoryModal
        jsaId={selectedItem?.jsaId}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </main>
  );
}
