import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ApiClientError } from '../../services/api-client';
import { apiClient } from '../../services/api-client';
import './administration.css';

type UserRow = {
  ID: string;
  USERNAME: string;
  DISPLAY_NAME: string;
  EMAIL?: string;
  IS_ACTIVE: 'Y' | 'N';
  DEFAULT_SITE_ID?: string;
  DEFAULT_RIG_ID?: string;
  DEFAULT_DEPARTMENT_ID?: string;
  ROW_VERSION: string;
};
type Page = { items: UserRow[]; total: number; offset: number; limit: number };
type UserForm = {
  enterpriseIdentityKey: string;
  username: string;
  displayName: string;
  email?: string;
  defaultSiteId?: string;
  defaultRigId?: string;
  defaultDepartmentId?: string;
  active: boolean;
};

export function AccessUsersPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<boolean | undefined>(true);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<UserForm>();
  const query = useQuery({
    queryKey: ['access-users', search, active, page],
    queryFn: () =>
      apiClient.get<Page>(
        `/access-administration/users?search=${encodeURIComponent(search)}&offset=${(page - 1) * 20}&limit=20${active === undefined ? '' : `&active=${active}`}`,
      ),
  });
  const create = useMutation({
    mutationFn: (value: UserForm) =>
      apiClient.post<{ id: string }, UserForm>('/access-administration/users', value),
    onSuccess: () => {
      setOpen(false);
      form.resetFields();
      void client.invalidateQueries({ queryKey: ['access-users'] });
    },
  });
  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div>
          <Typography.Text className="eyebrow">USER ACCESS ADMINISTRATION</Typography.Text>
          <Typography.Title level={1}>JSAMS Application Users</Typography.Title>
          <Typography.Paragraph type="secondary">
            Register existing enterprise identities and govern their JSAMS authorization. No
            credentials are stored here.
          </Typography.Paragraph>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Register application user
        </Button>
      </header>
      <div className="admin-toolbar">
        <div className="admin-filters">
          <Input.Search
            aria-label="Search users"
            placeholder="Username or display name"
            allowClear
            onSearch={setSearch}
          />
          <Select
            aria-label="Active state"
            value={active === undefined ? 'all' : String(active)}
            onChange={(v) => setActive(v === 'all' ? undefined : v === 'true')}
            options={[
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Inactive' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        <Space wrap>
          <Link to="/operations/access/roles">Roles and Permissions</Link>
          <Link to="/operations/access/approver-resolution">Approver Resolution</Link>
          <Link to="/operations/access/audit">Access Audit</Link>
        </Space>
      </div>
      {query.error && (
        <Alert type="error" showIcon message={(query.error as ApiClientError).message} />
      )}
      <div className="admin-table-wrap">
        <Table<UserRow>
          rowKey="ID"
          loading={query.isLoading}
          dataSource={query.data?.items}
          pagination={{
            current: page,
            pageSize: 20,
            total: query.data?.total,
            onChange: setPage,
            showSizeChanger: false,
          }}
          locale={{ emptyText: 'No application users match the current filters.' }}
          columns={[
            {
              title: 'Username',
              dataIndex: 'USERNAME',
              render: (v, r) => <Link to={`/operations/access/users/${r.ID}`}>{v}</Link>,
            },
            { title: 'Display name', dataIndex: 'DISPLAY_NAME' },
            { title: 'Email', dataIndex: 'EMAIL', render: (v) => v || '—' },
            {
              title: 'State',
              dataIndex: 'IS_ACTIVE',
              render: (v) => (
                <Tag color={v === 'Y' ? 'success' : 'default'}>
                  {v === 'Y' ? 'Active' : 'Inactive'}
                </Tag>
              ),
            },
            {
              title: 'Default context',
              render: (_, r) =>
                [r.DEFAULT_SITE_ID, r.DEFAULT_RIG_ID, r.DEFAULT_DEPARTMENT_ID]
                  .filter(Boolean)
                  .join(' / ') || 'None',
            },
            {
              title: 'Action',
              render: (_, r) => <Link to={`/operations/access/users/${r.ID}`}>Manage access</Link>,
            },
          ]}
        />
      </div>
      <Modal
        title="Register existing enterprise identity"
        open={open}
        onCancel={() => setOpen(false)}
        okText="Register in JSAMS"
        onOk={() => form.submit()}
        confirmLoading={create.isPending}
      >
        <Alert
          type="info"
          showIcon
          message="Authentication credentials are managed by the enterprise identity provider. JSAMS stores only the application-user mapping and authorization."
        />
        {create.error && (
          <Alert
            className="form-alert"
            type="error"
            showIcon
            message={(create.error as ApiClientError).message}
          />
        )}
        <Form
          form={form}
          layout="vertical"
          initialValues={{ active: true }}
          onFinish={(v) =>
            Modal.confirm({
              title: 'Register this enterprise identity in JSAMS?',
              content: 'Identity Key and Username become immutable after registration.',
              onOk: () => create.mutate(v),
            })
          }
        >
          <Form.Item
            label="Enterprise Identity Key"
            name="enterpriseIdentityKey"
            extra="Immutable enterprise object/subject identifier."
            rules={[{ required: true }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            label="Enterprise Username"
            name="username"
            extra="Canonical and immutable after registration."
            rules={[{ required: true }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item label="Display Name" name="displayName" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Email (optional)" name="email" rules={[{ type: 'email' }]}>
            <Input type="email" />
          </Form.Item>
          <div className="access-form-grid">
            <Form.Item label="Default Site ID" name="defaultSiteId">
              <Input />
            </Form.Item>
            <Form.Item label="Default Rig ID" name="defaultRigId">
              <Input />
            </Form.Item>
            <Form.Item label="Default Department ID" name="defaultDepartmentId">
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="active" valuePropName="checked">
            <Checkbox>Active in JSAMS</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </main>
  );
}
