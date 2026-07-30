import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import type { ApiClientError } from '../../services/api-client';
import { apiClient } from '../../services/api-client';
import './administration.css';
type Role = Record<string, any>;
type Page = { items: Role[]; total: number };
export function AccessRolesPage() {
  const client = useQueryClient(),
    [open, setOpen] = useState(false),
    [form] = Form.useForm();
  const query = useQuery({
    queryKey: ['access-roles'],
    queryFn: () => apiClient.get<Page>('/access-administration/roles?offset=0&limit=200'),
  });
  const permissions = useQuery({
    queryKey: ['access-permissions'],
    queryFn: () => apiClient.get<Role[]>('/access-administration/permissions'),
  });
  const create = useMutation({
    mutationFn: (v: any) => apiClient.post('/access-administration/roles', v),
    onSuccess: () => {
      setOpen(false);
      form.resetFields();
      void client.invalidateQueries({ queryKey: ['access-roles'] });
    },
  });
  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div>
          <Typography.Text className="eyebrow">USER ACCESS ADMINISTRATION</Typography.Text>
          <Typography.Title level={1}>Roles and Permissions</Typography.Title>
          <Typography.Paragraph type="secondary">
            Application Roles grant capabilities only. They do not grant data scope or workflow-role
            assignment.
          </Typography.Paragraph>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Create custom Role
        </Button>
      </header>
      {query.error && <Alert type="error" message={(query.error as ApiClientError).message} />}
      <div className="admin-table-wrap">
        <Table
          rowKey="ID"
          loading={query.isLoading}
          dataSource={query.data?.items}
          expandable={{ expandedRowRender: (r) => <RoleDetail roleId={r.ID} /> }}
          columns={[
            { title: 'Role code', dataIndex: 'ROLE_CODE' },
            { title: 'Role name', dataIndex: 'ROLE_NAME' },
            {
              title: 'Ownership',
              dataIndex: 'IS_SYSTEM_MANAGED',
              render: (v) => <Tag>{v === 'Y' ? 'System-managed' : 'Custom'}</Tag>,
            },
            {
              title: 'State',
              dataIndex: 'IS_ACTIVE',
              render: (v) => (
                <Tag color={v === 'Y' ? 'success' : 'default'}>
                  {v === 'Y' ? 'Active' : 'Inactive'}
                </Tag>
              ),
            },
          ]}
          pagination={false}
        />
      </div>
      <Typography.Title level={2}>Permission catalogue</Typography.Title>
      <div className="admin-table-wrap">
        <Table
          rowKey="ID"
          loading={permissions.isLoading}
          dataSource={permissions.data}
          pagination={false}
          columns={[
            { title: 'Group', dataIndex: 'PERMISSION_GROUP' },
            { title: 'Code', dataIndex: 'PERMISSION_CODE' },
            { title: 'Name', dataIndex: 'PERMISSION_NAME' },
            { title: 'Roles', dataIndex: 'ROLE_CODES', render: (v) => v || 'None' },
          ]}
        />
      </div>
      <Modal
        title="Create custom Role"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={create.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(v) => create.mutate(v)}>
          <Form.Item
            label="Role code"
            name="roleCode"
            extra="Immutable after creation."
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="Role name" name="roleName" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>
    </main>
  );
}
function RoleDetail({ roleId }: { roleId: string }) {
  const client = useQueryClient(),
    [permissionId, setPermissionId] = useState('');
  const p = useQuery({
      queryKey: ['role-permissions', roleId],
      queryFn: () => apiClient.get<Role[]>(`/access-administration/roles/${roleId}/permissions`),
    }),
    u = useQuery({
      queryKey: ['role-users', roleId],
      queryFn: () => apiClient.get<Role[]>(`/access-administration/roles/${roleId}/users`),
    });
  const assign = useMutation({
    mutationFn: () =>
      apiClient.post('/access-administration/assignments/role-permission', {
        roleId,
        permissionId,
      }),
    onSuccess: () => {
      setPermissionId('');
      void client.invalidateQueries({ queryKey: ['role-permissions', roleId] });
    },
  });
  const revoke = useMutation({
    mutationFn: (row: Role) =>
      apiClient.post(`/access-administration/assignments/role-permission/${row.ID}/revoke`, {
        rowVersion: row.ROW_VERSION,
        roleId,
        permissionId: row.PERMISSION_ID,
        reason: 'Revoked by access administrator',
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['role-permissions', roleId] }),
  });
  return (
    <div className="access-role-detail">
      <Typography.Text strong>Assigned Permissions</Typography.Text>
      <Alert
        type="info"
        showIcon
        message="Permission assignment does not grant Data Scope or Workflow Role."
      />
      <Space.Compact>
        <Input
          aria-label="Permission ID"
          placeholder="Active Permission ID"
          value={permissionId}
          onChange={(e) => setPermissionId(e.target.value)}
        />
        <Button onClick={() => assign.mutate()} disabled={!permissionId} loading={assign.isPending}>
          Assign
        </Button>
      </Space.Compact>
      {assign.error && <Alert type="error" message={(assign.error as ApiClientError).message} />}
      <div>
        {p.data?.map((x) => (
          <Tag
            closable={x.IS_ACTIVE === 'Y'}
            onClose={(e) => {
              e.preventDefault();
              revoke.mutate(x);
            }}
            key={x.ID}
          >
            {x.PERMISSION_CODE} · {x.IS_ACTIVE === 'Y' ? 'Active' : 'Historical'}
          </Tag>
        )) || 'Loading…'}
      </div>
      <Typography.Text strong>Assigned Users</Typography.Text>
      <div>
        {u.data?.map((x) => (
          <Tag key={x.ID}>
            {x.USERNAME} · {x.IS_ACTIVE === 'Y' ? 'Active' : 'Historical'}
          </Tag>
        )) || 'Loading…'}
      </div>
    </div>
  );
}
