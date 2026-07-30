import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  OrganizationKind,
  OrganizationOption,
  OrganizationRecord,
  PaginatedResponse,
} from '@jsams/shared-types';
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import type { ApiClientError } from '../../services/api-client';
import { apiClient } from '../../services/api-client';
import './administration.css';

interface OrganizationFormValue {
  code: string;
  name: string;
  siteId: string;
  rigId?: string;
}

export function OrganizationPage({ kind }: { kind: OrganizationKind }) {
  const title = kind === 'rigs' ? 'Rigs' : 'Departments';
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [active, setActive] = useState<boolean | undefined>(true);
  const [editing, setEditing] = useState<OrganizationRecord>();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<OrganizationFormValue>();
  const siteId = Form.useWatch('siteId', form);

  const records = useQuery({
    queryKey: ['organization', kind, page, keyword, active],
    queryFn: () =>
      apiClient.get<PaginatedResponse<OrganizationRecord>>(
        `/master-data/organization/${kind}?page=${page}&pageSize=20&keyword=${encodeURIComponent(keyword)}${active === undefined ? '' : `&active=${active}`}`,
      ),
  });
  const sites = useQuery({
    queryKey: ['scope-options', 'SITE'],
    queryFn: () => apiClient.get<OrganizationOption[]>('/master-data/scope-options/list?type=SITE'),
  });
  const rigs = useQuery({
    queryKey: ['scope-options', 'RIG', siteId],
    queryFn: () =>
      apiClient.get<OrganizationOption[]>(
        `/master-data/scope-options/list?type=RIG&siteId=${siteId}`,
      ),
    enabled: kind === 'departments' && Boolean(siteId),
  });
  const save = useMutation({
    mutationFn: (value: OrganizationFormValue) =>
      editing
        ? apiClient.put(`/master-data/organization/${kind}/${editing.id}`, {
            ...value,
            rowVersion: editing.rowVersion,
          })
        : apiClient.post(`/master-data/organization/${kind}`, value),
    onSuccess: () => {
      setOpen(false);
      setEditing(undefined);
      form.resetFields();
      void client.invalidateQueries({ queryKey: ['organization', kind] });
      void client.invalidateQueries({ queryKey: ['scope-options'] });
    },
  });
  const setRecordActive = useMutation({
    mutationFn: (record: OrganizationRecord) =>
      apiClient.post(
        `/master-data/organization/${kind}/${record.id}/${record.active ? 'deactivate' : 'activate'}`,
        { rowVersion: record.rowVersion },
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['organization', kind] });
      void client.invalidateQueries({ queryKey: ['scope-options'] });
    },
  });

  const begin = (record?: OrganizationRecord) => {
    setEditing(record);
    form.resetFields();
    form.setFieldsValue(
      record
        ? {
            code: record.code,
            name: record.name,
            siteId: record.siteId,
            rigId: record.rigId,
          }
        : { code: '', name: '', rigId: undefined },
    );
    setOpen(true);
  };

  return (
    <section className="admin-page">
      <header className="admin-page-header">
        <div>
          <Typography.Title level={1}>{title}</Typography.Title>
          <Typography.Paragraph type="secondary">
            Governed organization data used by JSA ownership, workflow, scope, and official
            numbering. Records are deactivated rather than deleted.
          </Typography.Paragraph>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => begin()}>
          Create {kind === 'rigs' ? 'Rig' : 'Department'}
        </Button>
      </header>
      <div className="admin-toolbar">
        <div className="admin-filters">
          <Input.Search
            aria-label={`Search ${title}`}
            placeholder="Search code or name"
            allowClear
            onSearch={(value) => {
              setKeyword(value);
              setPage(1);
            }}
          />
          <Select
            aria-label="Filter active status"
            value={active === undefined ? 'ALL' : active ? 'ACTIVE' : 'INACTIVE'}
            onChange={(value) => {
              setActive(value === 'ALL' ? undefined : value === 'ACTIVE');
              setPage(1);
            }}
            options={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INACTIVE', label: 'Inactive' },
              { value: 'ALL', label: 'All' },
            ]}
          />
        </div>
      </div>
      {records.error ? (
        <Alert
          type="error"
          showIcon
          message={`Unable to load ${title}`}
          description={(records.error as ApiClientError).message}
        />
      ) : null}
      <div className="admin-table-wrap">
        <Table<OrganizationRecord>
          rowKey="id"
          loading={records.isLoading}
          dataSource={records.data?.items ?? []}
          pagination={{
            current: page,
            pageSize: 20,
            total: records.data?.total ?? 0,
            onChange: setPage,
            showSizeChanger: false,
          }}
          scroll={{ x: 850 }}
          columns={[
            { title: 'Code', dataIndex: 'code', width: 170 },
            { title: 'Name', dataIndex: 'name' },
            {
              title: 'Site',
              render: (_, record) => `${record.siteCode} — ${record.siteName}`,
            },
            ...(kind === 'departments'
              ? [
                  {
                    title: 'Rig',
                    render: (_: unknown, record: OrganizationRecord) =>
                      `${record.rigCode} — ${record.rigName}`,
                  },
                ]
              : []),
            {
              title: 'Status',
              width: 110,
              render: (_, record) => (
                <Tag color={record.active ? 'green' : 'default'}>
                  {record.active ? 'Active' : 'Inactive'}
                </Tag>
              ),
            },
            {
              title: 'Actions',
              width: 230,
              render: (_, record) => (
                <Space>
                  <Button onClick={() => begin(record)}>Edit</Button>
                  <Popconfirm
                    title={`${record.active ? 'Deactivate' : 'Reactivate'} this ${kind === 'rigs' ? 'Rig' : 'Department'}?`}
                    onConfirm={() => setRecordActive.mutate(record)}
                  >
                    <Button danger={record.active}>
                      {record.active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </div>
      <Modal
        title={`${editing ? 'Edit' : 'Create'} ${kind === 'rigs' ? 'Rig' : 'Department'}`}
        open={open}
        onCancel={() => {
          setOpen(false);
          setEditing(undefined);
        }}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        destroyOnHidden
      >
        {save.error ? (
          <Alert
            type="error"
            showIcon
            message={(save.error as ApiClientError).message}
            description={(save.error as ApiClientError).code}
          />
        ) : null}
        <Form form={form} layout="vertical" onFinish={(value) => save.mutate(value)}>
          <Form.Item name="siteId" label="Site" rules={[{ required: true }]}>
            <Select
              disabled={Boolean(editing)}
              showSearch
              optionFilterProp="label"
              onChange={() => form.setFieldValue('rigId', undefined)}
              options={sites.data?.map(toOption)}
            />
          </Form.Item>
          {kind === 'departments' ? (
            <Form.Item name="rigId" label="Rig" rules={[{ required: true }]}>
              <Select
                disabled={Boolean(editing)}
                showSearch
                optionFilterProp="label"
                loading={rigs.isLoading}
                options={rigs.data?.map(toOption)}
              />
            </Form.Item>
          ) : null}
          <Form.Item
            name="code"
            label="Code"
            rules={[
              { required: true },
              {
                pattern: /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
                message: 'Use letters, numbers, underscore, or hyphen only',
              },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}

const toOption = (item: OrganizationOption) => ({
  value: item.id,
  label: `${item.code} — ${item.name}`,
});
