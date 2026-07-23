import { Alert, Button, Card, Space, Spin, Table, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { WorkflowQueueItem } from '@jsams/shared-types';
import { workflowApi } from './workflow-api';
import './workflow.css';
const labels = {
  approvals: 'Needs Approval',
  pending: 'Pending Approval',
  rejected: 'Rejected JSA',
  published: 'Published JSA',
};
export function WorkflowQueuePage({ kind }: { kind: keyof typeof labels }) {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['workflow-queue', kind],
    queryFn: () => workflowApi.queue(kind),
  });
  return (
    <main className="workflow-page">
      <Typography.Text className="eyebrow">JSA WORKFLOW</Typography.Text>
      <Typography.Title level={1}>{labels[kind]}</Typography.Title>
      <Typography.Paragraph>
        Records are filtered by your workflow assignment and governed data scope.
      </Typography.Paragraph>
      {query.isLoading ? (
        <Spin />
      ) : query.error ? (
        <Alert type="error" showIcon message="Queue could not be loaded" />
      ) : (
        <Card>
          <Table<WorkflowQueueItem>
            rowKey="instanceId"
            dataSource={query.data ?? []}
            pagination={{ pageSize: 20 }}
            columns={[
              { title: 'JSA Number', dataIndex: 'jsaNumber' },
              { title: 'Job', dataIndex: 'jobTitle', render: (v) => v || '—' },
              { title: 'Status', dataIndex: 'versionStatus', render: (v) => <Tag>{v}</Tag> },
              { title: 'Current step', dataIndex: 'currentStepName', render: (v) => v || '—' },
              {
                title: 'Updated',
                dataIndex: 'updatedAt',
                render: (v) => new Date(v).toLocaleString(),
              },
              {
                title: '',
                render: (_, r) => (
                  <Space>
                    <Button onClick={() => navigate(`/jsa/${r.jsaId}/workflow`)}>Workflow</Button>
                    <Button onClick={() => navigate(`/jsa/${r.jsaId}/draft`)}>
                      {kind === 'published' ? 'View JSA' : 'Open JSA'}
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      )}
    </main>
  );
}
