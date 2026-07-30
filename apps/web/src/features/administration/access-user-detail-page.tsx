import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import type { ApiClientError } from '../../services/api-client';
import { apiClient } from '../../services/api-client';
import './administration.css';

type RecordRow = Record<string, any>;
export function AccessUserDetailPage() {
  const { userId = '' } = useParams();
  const client = useQueryClient();
  const profile = useQuery({
    queryKey: ['access-user', userId],
    queryFn: () => apiClient.get<RecordRow>(`/access-administration/users/${userId}`),
  });
  const related = (kind: string) =>
    useQuery({
      queryKey: ['access-user', userId, kind],
      queryFn: () => apiClient.get<RecordRow[]>(`/access-administration/users/${userId}/${kind}`),
    });
  const roles = related('roles'),
    overrides = related('overrides'),
    scopes = related('scopes'),
    workflow = related('workflow-roles'),
    impact = related('pending-impact');
  const effective = useQuery({
    queryKey: ['access-user', userId, 'effective-access'],
    queryFn: () =>
      apiClient.get<RecordRow>(`/access-administration/users/${userId}/effective-access`),
  });
  const lifecycle = useMutation({
    mutationFn: (active: boolean) =>
      apiClient.post(
        `/access-administration/users/${userId}/${active ? 'activate' : 'deactivate'}`,
        {
          rowVersion: profile.data?.ROW_VERSION,
          reason: active ? 'Restore JSAMS eligibility' : 'Administrative deactivation',
        },
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['access-user', userId] });
    },
  });
  if (profile.isLoading) return <Spin />;
  if (profile.error)
    return <Alert type="error" showIcon message={(profile.error as ApiClientError).message} />;
  const p = profile.data!;
  const grid = (rows?: RecordRow[]) => (
    <Table
      size="small"
      rowKey={(r) => r.ID ?? JSON.stringify(r)}
      dataSource={rows}
      pagination={false}
      scroll={{ x: true }}
      locale={{
        emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No assignments" />,
      }}
      columns={
        rows?.[0]
          ? Object.keys(rows[0])
              .slice(0, 8)
              .map((key) => ({
                title: key.replaceAll('_', ' '),
                dataIndex: key,
                render: (v: any) => (v == null ? '—' : String(v)),
              }))
          : []
      }
    />
  );
  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div>
          <Link to="/operations/access/users">← Application users</Link>
          <Typography.Title level={1}>{p.DISPLAY_NAME}</Typography.Title>
          <Space>
            <Typography.Text code>{p.USERNAME}</Typography.Text>
            <Tag color={p.IS_ACTIVE === 'Y' ? 'success' : 'default'}>
              {p.IS_ACTIVE === 'Y' ? 'Active' : 'Inactive'}
            </Tag>
          </Space>
        </div>
        <Popconfirm
          title={`${p.IS_ACTIVE === 'Y' ? 'Deactivate' : 'Activate'} JSAMS access?`}
          description={
            p.IS_ACTIVE === 'Y'
              ? 'JSAMS access stops; enterprise directory, assignments and history are unchanged. Pending approvals may block this action.'
              : 'This restores JSAMS eligibility only; expired/revoked assignments remain unchanged.'
          }
          onConfirm={() => lifecycle.mutate(p.IS_ACTIVE !== 'Y')}
        >
          <Button danger={p.IS_ACTIVE === 'Y'} loading={lifecycle.isPending}>
            {p.IS_ACTIVE === 'Y' ? 'Deactivate' : 'Activate'}
          </Button>
        </Popconfirm>
      </header>
      {lifecycle.error && (
        <Alert
          type="error"
          showIcon
          message={(lifecycle.error as ApiClientError).message}
          description={
            (lifecycle.error as ApiClientError).code === 'PENDING_WORKFLOW_IMPACT'
              ? 'Resolve or reassign the listed pending workflow tasks before deactivation.'
              : undefined
          }
        />
      )}
      <Tabs
        items={[
          {
            key: 'profile',
            label: 'Profile',
            children: (
              <Card>
                <Descriptions
                  column={{ xs: 1, md: 2 }}
                  items={[
                    { key: 'id', label: 'User ID', children: p.ID },
                    {
                      key: 'identity',
                      label: 'Enterprise Identity Key',
                      children: p.ENTERPRISE_IDENTITY_KEY,
                    },
                    { key: 'username', label: 'Username', children: p.USERNAME },
                    { key: 'name', label: 'Display Name', children: p.DISPLAY_NAME },
                    { key: 'email', label: 'Email', children: p.EMAIL || '—' },
                    {
                      key: 'default',
                      label: 'Default context',
                      children:
                        [p.DEFAULT_SITE_ID, p.DEFAULT_RIG_ID, p.DEFAULT_DEPARTMENT_ID]
                          .filter(Boolean)
                          .join(' / ') || 'None',
                    },
                    {
                      key: 'created',
                      label: 'Created',
                      children: `${p.CREATED_AT} by ${p.CREATED_BY}`,
                    },
                    {
                      key: 'updated',
                      label: 'Updated',
                      children: `${p.UPDATED_AT} by ${p.UPDATED_BY}`,
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'roles',
            label: `Roles (${roles.data?.length ?? 0})`,
            children: (
              <AssignmentPanel
                userId={userId}
                kind="user-role"
                rows={roles.data}
                note="A Role grants application capabilities only; it does not grant Scope or Workflow Role."
              />
            ),
          },
          {
            key: 'overrides',
            label: 'Permission Overrides',
            children: (
              <AssignmentPanel
                userId={userId}
                kind="override"
                rows={overrides.data}
                note="Precedence: explicit DENY → explicit ALLOW → Role grant → default deny. A reason is mandatory for DENY."
              />
            ),
          },
          {
            key: 'scope',
            label: 'Data Scope',
            children: (
              <AssignmentPanel
                userId={userId}
                kind="scope"
                rows={scopes.data}
                note="Scope controls where the user may View or Act; it does not grant application permission. Act requires View."
              />
            ),
          },
          {
            key: 'workflow',
            label: 'Workflow Roles',
            children: (
              <>
                <AssignmentPanel
                  userId={userId}
                  kind="workflow"
                  rows={workflow.data}
                  note="Workflow Role alone is insufficient: active user, approval Permission, and ACT Scope are also required."
                />
                <p>
                  <Link to="/operations/access/approver-resolution">Open Approver Resolution</Link>
                </p>
              </>
            ),
          },
          {
            key: 'effective',
            label: 'Effective Access',
            children: effective.isLoading ? (
              <Spin />
            ) : (
              <>
                <Card title="Effective permissions">{grid(effective.data?.permissions)}</Card>
                <Card title="Current pending tasks">{grid(effective.data?.pendingTasks)}</Card>
              </>
            ),
          },
          {
            key: 'impact',
            label: `Pending Workflow Impact (${impact.data?.length ?? 0})`,
            children: grid(impact.data),
          },
          {
            key: 'audit',
            label: 'Audit History',
            children: (
              <Link to={`/operations/access/audit?target=${encodeURIComponent(p.USERNAME)}`}>
                Open filtered Access Audit
              </Link>
            ),
          },
        ]}
      />
    </main>
  );
}
function AssignmentPanel({
  userId,
  kind,
  rows,
  note,
}: {
  userId: string;
  kind: 'user-role' | 'override' | 'scope' | 'workflow';
  rows?: RecordRow[];
  note: string;
}) {
  const client = useQueryClient(),
    [open, setOpen] = useState(false),
    [form] = Form.useForm();
  const mutation = useMutation({
    mutationFn: (value: any) =>
      apiClient.post(`/access-administration/assignments/${kind}`, { ...value, userId }),
    onSuccess: () => {
      setOpen(false);
      form.resetFields();
      void client.invalidateQueries({ queryKey: ['access-user', userId] });
    },
  });
  const revoke = useMutation({
    mutationFn: (row: RecordRow) =>
      apiClient.post(`/access-administration/assignments/${kind}/${row.ID}/revoke`, {
        rowVersion: row.ROW_VERSION,
        reason: 'Revoked by access administrator',
        userId,
        roleId: row.ROLE_ID,
        permissionId: row.PERMISSION_ID,
        effect: row.EFFECT_CODE,
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['access-user', userId] }),
  });
  const fields =
    kind === 'user-role' ? (
      <Form.Item label="Active Role ID" name="roleId" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
    ) : kind === 'override' ? (
      <>
        <Form.Item label="Active Permission ID" name="permissionId" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Effect" name="effect" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'ALLOW', label: 'ALLOW' },
              { value: 'DENY', label: 'DENY' },
            ]}
          />
        </Form.Item>
        <Form.Item label="Reason" name="reason">
          <Input.TextArea />
        </Form.Item>
      </>
    ) : kind === 'scope' ? (
      <>
        <Form.Item label="Scope type" name="scopeType" rules={[{ required: true }]}>
          <Select
            options={['SITE', 'RIG', 'DEPARTMENT'].map((value) => ({ value, label: value }))}
          />
        </Form.Item>
        <ContextFields />
        <Space>
          <Form.Item name="canView" valuePropName="checked" initialValue>
            <Checkbox>Can View</Checkbox>
          </Form.Item>
          <Form.Item name="canAct" valuePropName="checked">
            <Checkbox>Can Act</Checkbox>
          </Form.Item>
        </Space>
      </>
    ) : (
      <>
        <Form.Item label="Workflow Role code" name="workflowRoleCode" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <ContextFields />
      </>
    );
  return (
    <Card
      title={kind.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
      extra={<Button onClick={() => setOpen(true)}>Add assignment</Button>}
    >
      <Alert type="info" showIcon message={note} />
      {mutation.error && (
        <Alert type="error" showIcon message={(mutation.error as ApiClientError).message} />
      )}
      <Table
        size="small"
        rowKey="ID"
        dataSource={rows}
        pagination={false}
        scroll={{ x: true }}
        locale={{
          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No assignments" />,
        }}
        columns={[
          ...(rows?.[0]
            ? Object.keys(rows[0])
                .filter((key) => !['CREATED_BY', 'UPDATED_BY'].includes(key))
                .slice(0, 8)
            : []
          ).map((key) => ({
            title: key.replaceAll('_', ' '),
            dataIndex: key,
            render: (v: any) => (v == null ? '—' : String(v)),
          })),
          {
            title: 'Action',
            fixed: 'right' as const,
            render: (_: any, row: RecordRow) =>
              row.IS_ACTIVE === 'Y' ? (
                <Popconfirm
                  title="Revoke this assignment?"
                  description="History is retained. Pending workflow impact may block the change."
                  onConfirm={() => revoke.mutate(row)}
                >
                  <Button danger size="small" loading={revoke.isPending}>
                    Revoke
                  </Button>
                </Popconfirm>
              ) : (
                <Tag>Historical</Tag>
              ),
          },
        ]}
      />
      <Modal
        title="Add governed assignment"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={mutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)}>
          {fields}
          <div className="access-form-grid">
            <Form.Item label="Effective From (ISO, optional)" name="effectiveFrom">
              <Input />
            </Form.Item>
            <Form.Item label="Effective To (ISO, optional)" name="effectiveTo">
              <Input />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </Card>
  );
}
function ContextFields() {
  return (
    <div className="access-form-grid">
      <Form.Item label="Site ID" name="siteId" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item label="Rig ID" name="rigId">
        <Input />
      </Form.Item>
      <Form.Item label="Department ID" name="departmentId">
        <Input />
      </Form.Item>
    </div>
  );
}
