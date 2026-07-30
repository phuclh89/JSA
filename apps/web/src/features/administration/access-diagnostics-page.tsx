import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input, List, Space, Spin, Steps, Tag, Typography } from 'antd';
import type { ApiClientError } from '../../services/api-client';
import { apiClient } from '../../services/api-client';
import './administration.css';
type Context = {
  siteId: string;
  rigId: string;
  departmentId: string;
  jobTypeId: string;
  jsaVersionId?: string;
};
export function AccessDiagnosticsPage({ mode }: { mode: 'approvers' | 'readiness' }) {
  const identity = useQuery({
    queryKey: ['identity-configuration'],
    queryFn: () => apiClient.get<any>('/access-administration/identity-configuration'),
  });
  const run = useMutation({
    mutationFn: (v: Context) =>
      apiClient.post<any, Context>(
        mode === 'approvers'
          ? '/access-administration/previews/approvers'
          : '/access-administration/uat-readiness',
        v,
      ),
  });
  const data = run.data;
  const preview = mode === 'approvers' ? data : data?.approverResolution;
  return (
    <main className="admin-page">
      <header>
        <Typography.Text className="eyebrow">APPROVAL UAT ENABLEMENT</Typography.Text>
        <Typography.Title level={1}>
          {mode === 'approvers' ? 'Approver Resolution' : 'Approval UAT Readiness'}
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          {mode === 'approvers'
            ? 'Read-only preview using the same workflow binding and assignee resolver as runtime. It creates no tasks or notifications.'
            : 'Validate actual runtime configuration before authenticated Submit and Approve testing.'}
        </Typography.Paragraph>
      </header>
      <Card title="Workflow context">
        <Form layout="vertical" onFinish={(v) => run.mutate(v)}>
          <div className="access-form-grid">
            <Form.Item name="siteId" label="Site ID" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="rigId" label="Rig ID" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="departmentId" label="Department ID" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="jobTypeId" label="Job Type ID" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="jsaVersionId" label="Draft JSA Version ID (optional)">
              <Input />
            </Form.Item>
          </div>
          <Button type="primary" htmlType="submit" loading={run.isPending}>
            Run {mode === 'approvers' ? 'resolution' : 'readiness check'}
          </Button>
        </Form>
      </Card>
      {run.error && <Alert type="error" showIcon message={(run.error as ApiClientError).message} />}
      {mode === 'readiness' && (
        <Card title="Non-sensitive identity configuration">
          {identity.isLoading ? (
            <Spin />
          ) : (
            <Space wrap>
              <Tag>{identity.data?.mode}</Tag>
              <Tag>
                {identity.data?.immutableIdentityRequired
                  ? 'Immutable identity required'
                  : 'Non-production identity policy'}
              </Tag>
              <Tag>{identity.data?.usernameNormalization}</Tag>
              <Typography.Text>
                Username fallback: {identity.data?.usernameFallbackEnabled ? 'enabled' : 'disabled'}
              </Typography.Text>
            </Space>
          )}
        </Card>
      )}
      {data && mode === 'readiness' && (
        <Alert
          type={data.ready ? 'success' : 'error'}
          showIcon
          message={
            data.ready ? 'Ready for authenticated approval UAT' : 'Not ready for approval UAT'
          }
          description={`${data.blockers?.length ?? 0} blocker(s), ${data.warnings?.length ?? 0} warning(s)`}
        />
      )}
      {data?.blockers?.length > 0 && (
        <Card title="Blocking checks">
          <List
            dataSource={data.blockers}
            renderItem={(x: any) => (
              <List.Item>
                <Tag color="error">{x.code}</Tag>
                {x.message}
              </List.Item>
            )}
          />
        </Card>
      )}
      {preview && (
        <Card title="Resolved approval chain">
          {preview.errors?.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message="Resolution blockers"
              description={preview.errors.join(' · ')}
            />
          )}
          <Steps
            direction="vertical"
            current={preview.configured ? preview.steps?.length : 0}
            items={(preview.steps ?? []).map((s: any) => ({
              title: `${s.stepOrder}. ${s.stepName}`,
              subTitle: s.workflowRoleCode,
              description: `${s.assigneeName} · User ${s.assigneeUserId}`,
              status: 'finish',
            }))}
          />
        </Card>
      )}
    </main>
  );
}
