import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Spin, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { JsaDraftListItem } from '@jsams/shared-types';
import type { ApiClientError } from '../../services/api-client';
import { jsaApi } from './jsa-api';
import './workflow.css';

const updatedAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function MyDraftsPage() {
  const navigate = useNavigate();
  const drafts = useQuery({
    queryKey: ['jsa-drafts', 'mine'],
    queryFn: jsaApi.myDrafts,
    refetchOnWindowFocus: false,
  });
  const capabilities = useQuery({
    queryKey: ['jsa-capabilities'],
    queryFn: jsaApi.capabilities,
  });
  const columns = useMemo<ColumnsType<JsaDraftListItem>>(
    () => [
      { title: 'Temporary Number', dataIndex: 'jsaNumber', width: 190 },
      {
        title: 'Job',
        dataIndex: 'jobTitle',
        width: 260,
        ellipsis: true,
        render: (value) => value || '—',
      },
      {
        title: 'Status',
        dataIndex: 'versionStatus',
        width: 120,
        render: (value) => <Tag color={value === 'RETURNED' ? 'orange' : 'default'}>{value}</Tag>,
      },
      {
        title: 'Site / Rig',
        width: 220,
        ellipsis: true,
        render: (_, record) => `${record.ownerSiteCode} / ${record.rigCode}`,
      },
      {
        title: 'Department',
        dataIndex: 'departmentCode',
        width: 150,
      },
      {
        title: 'Updated',
        dataIndex: 'updatedAt',
        width: 180,
        render: (value) => updatedAtFormatter.format(new Date(value)),
      },
      {
        title: 'Action',
        key: 'action',
        width: 160,
        render: (_, record) => (
          <Button type="primary" onClick={() => navigate(`/jsa/${record.jsaId}/draft`)}>
            Continue editing
          </Button>
        ),
      },
    ],
    [navigate],
  );

  return (
    <main className="workflow-page my-drafts-page">
      <Typography.Text className="eyebrow">JSA WORKSPACE</Typography.Text>
      <Typography.Title level={1}>My Drafts</Typography.Title>
      <Typography.Paragraph>
        Draft and Returned JSAs created by you and still available within your governed data scope.
      </Typography.Paragraph>
      <Card className="my-drafts-card">
        {drafts.isLoading ? (
          <div className="my-drafts-feedback">
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
          <div className="my-drafts-table-scroll">
            <Table<JsaDraftListItem>
              className="my-drafts-table"
              rowKey="jsaId"
              dataSource={drafts.data ?? []}
              pagination={{ pageSize: 20, hideOnSinglePage: true }}
              tableLayout="fixed"
              locale={{
                emptyText: (
                  <Empty description="You have no Draft or Returned JSA">
                    {capabilities.data?.create && (
                      <Button type="primary" onClick={() => navigate('/jsa/new')}>
                        Create JSA
                      </Button>
                    )}
                  </Empty>
                ),
              }}
              columns={columns}
            />
          </div>
        )}
      </Card>
    </main>
  );
}
