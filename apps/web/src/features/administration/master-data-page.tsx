import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MasterDataKind,
  MasterDataRecord,
  OrganizationOption,
  PaginatedResponse,
  ReferenceScopeType,
} from '@jsams/shared-types';
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useMemo, useState } from 'react';
import type { ApiClientError } from '../../services/api-client';
import { apiClient } from '../../services/api-client';
import './administration.css';

interface ExtraFieldConfig {
  key: string;
  label: string;
  type?: 'text' | 'select' | 'tool-category';
  options?: string[];
  required?: boolean;
}
interface PageConfig {
  kind: MasterDataKind;
  title: string;
  nameLabel: string;
  extra: ExtraFieldConfig[];
  departmentScope?: boolean;
}
const configs: Record<MasterDataKind, PageConfig> = {
  'job-types': {
    kind: 'job-types',
    title: 'Job Types',
    nameLabel: 'Job Type name',
    extra: [],
    departmentScope: true,
  },
  'hazard-prompts': {
    kind: 'hazard-prompts',
    title: 'Hazard Assessment Prompts',
    nameLabel: 'Prompt label',
    extra: [{ key: 'group', label: 'Prompt group' }],
  },
  positions: {
    kind: 'positions',
    title: 'Positions',
    nameLabel: 'Position name',
    extra: [{ key: 'alternateName', label: 'Alternate / English name' }],
    departmentScope: true,
  },
  'tool-categories': {
    kind: 'tool-categories',
    title: 'Tool Categories',
    nameLabel: 'Category name',
    extra: [],
    departmentScope: true,
  },
  tools: {
    kind: 'tools',
    title: 'Tools',
    nameLabel: 'Tool name',
    extra: [
      { key: 'toolCategoryId', label: 'Tool Category', type: 'tool-category', required: true },
      { key: 'alternateName', label: 'Alternate name' },
    ],
    departmentScope: true,
  },
  languages: {
    kind: 'languages',
    title: 'Languages',
    nameLabel: 'Language name',
    extra: [{ key: 'localeCode', label: 'Locale code' }],
    departmentScope: true,
  },
  'procedure-references': {
    kind: 'procedure-references',
    title: 'Procedure References',
    nameLabel: 'Title',
    extra: [
      { key: 'documentVersion', label: 'Document version' },
      { key: 'effectiveDate', label: 'Effective date' },
      { key: 'expiryDate', label: 'Expiry date' },
      { key: 'externalUrl', label: 'External URL' },
    ],
  },
  'system-parameters': {
    kind: 'system-parameters',
    title: 'System Parameters',
    nameLabel: 'Parameter key',
    extra: [
      {
        key: 'valueType',
        label: 'Value type',
        type: 'select',
        options: ['STRING', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'JSON'],
        required: true,
      },
      { key: 'value', label: 'Non-secret value', required: true },
    ],
  },
};

type FormValue = {
  code: string;
  name: string;
  description?: string;
  displayOrder: number;
  scopeType: ReferenceScopeType;
  siteId?: string;
  rigId?: string;
  departmentId?: string;
  attributes: Record<string, string | number | boolean | null>;
  rowVersion?: string;
};

export function MasterDataPage({ kind }: { kind: MasterDataKind }) {
  const config = configs[kind];
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [active, setActive] = useState<boolean | undefined>(true);
  const [editing, setEditing] = useState<MasterDataRecord | undefined>();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<FormValue>();
  const query = useQuery({
    queryKey: ['master-data', kind, page, keyword, active],
    queryFn: () =>
      apiClient.get<PaginatedResponse<MasterDataRecord>>(
        `/master-data/${kind}?page=${page}&pageSize=20&keyword=${encodeURIComponent(keyword)}${active === undefined ? '' : `&active=${active}`}`,
      ),
  });
  const mutation = useMutation({
    mutationFn: (value: FormValue) =>
      editing
        ? apiClient.put<MasterDataRecord, FormValue>(`/master-data/${kind}/${editing.id}`, {
            ...value,
            rowVersion: editing.rowVersion,
          })
        : apiClient.post<MasterDataRecord, FormValue>(`/master-data/${kind}`, value),
    onSuccess: () => {
      setOpen(false);
      setEditing(undefined);
      form.resetFields();
      void client.invalidateQueries({ queryKey: ['master-data', kind] });
    },
  });
  const activeMutation = useMutation({
    mutationFn: (record: MasterDataRecord) =>
      apiClient.post<MasterDataRecord>(
        `/master-data/${kind}/${record.id}/${record.active ? 'deactivate' : 'activate'}`,
        { rowVersion: record.rowVersion },
      ),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['master-data', kind] }),
  });
  const begin = (record?: MasterDataRecord) => {
    setEditing(record);
    form.setFieldsValue(
      record
        ? { ...record, attributes: record.attributes }
        : {
            code: '',
            name: '',
            description: '',
            displayOrder: 0,
            scopeType: 'GLOBAL',
            attributes: {},
          },
    );
    setOpen(true);
  };
  const columns = useMemo(
    () => [
      { title: 'Code', dataIndex: 'code', key: 'code' },
      { title: config.nameLabel, dataIndex: 'name', key: 'name' },
      {
        title: 'Scope',
        key: 'scope',
        render: (_: unknown, r: MasterDataRecord) =>
          `${r.scopeType}${r.siteId ? ` · Site ${r.siteId}` : ''}${r.rigId ? ` · Rig ${r.rigId}` : ''}${r.departmentId ? ` · Department ${r.departmentId}` : ''}`,
      },
      {
        title: 'Status',
        key: 'status',
        render: (_: unknown, r: MasterDataRecord) => (
          <Tag color={r.active ? 'green' : 'default'}>{r.active ? 'Active' : 'Inactive'}</Tag>
        ),
      },
      {
        title: 'Actions',
        key: 'actions',
        render: (_: unknown, r: MasterDataRecord) => (
          <Space wrap>
            <Button onClick={() => begin(r)}>Edit</Button>
            <Popconfirm
              title={`${r.active ? 'Deactivate' : 'Reactivate'} this record?`}
              onConfirm={() => activeMutation.mutate(r)}
            >
              <Button danger={r.active}>{r.active ? 'Deactivate' : 'Reactivate'}</Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [activeMutation, config.nameLabel],
  );
  return (
    <section className="admin-page">
      <header className="admin-page-header">
        <div>
          <Typography.Title level={1}>{config.title}</Typography.Title>
          <Typography.Paragraph type="secondary">
            Governed reference data. Records are deactivated rather than deleted.
          </Typography.Paragraph>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => begin()}>
          Create
        </Button>
      </header>
      <div className="admin-toolbar">
        <div className="admin-filters">
          <Input.Search
            aria-label={`Search ${config.title}`}
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
      {query.isError ? (
        <Alert
          type="error"
          showIcon
          message="Unable to load master data"
          description={(query.error as Error).message}
        />
      ) : null}
      <div className="admin-table-wrap">
        <Table
          rowKey="id"
          loading={query.isLoading}
          dataSource={query.data?.items ?? []}
          columns={columns}
          locale={{ emptyText: 'No records match the current filters.' }}
          pagination={{
            current: page,
            pageSize: 20,
            total: query.data?.total ?? 0,
            onChange: setPage,
            showSizeChanger: false,
          }}
          scroll={{ x: 900 }}
        />
      </div>
      <Modal
        title={`${editing ? 'Edit' : 'Create'} ${config.title}`}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={mutation.isPending}
        destroyOnHidden
      >
        {mutation.error ? (
          <Alert
            type="error"
            showIcon
            message={(mutation.error as ApiClientError).message}
            description={(mutation.error as ApiClientError).code}
          />
        ) : null}
        <Form
          form={form}
          layout="vertical"
          onFinish={(value) => mutation.mutate({ ...value, attributes: value.attributes ?? {} })}
        >
          <Form.Item name="code" label="Code" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label={config.nameLabel} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="displayOrder" label="Display order" rules={[{ required: true }]}>
            <InputNumber min={0} />
          </Form.Item>
          <ScopeFields form={form} departmentScope={config.departmentScope} />
          {config.extra.map((field) => (
            <MasterAttributeField key={field.key} field={field} />
          ))}
        </Form>
      </Modal>
    </section>
  );
}

function MasterAttributeField({ field }: { field: ExtraFieldConfig }) {
  const categories = useQuery({
    queryKey: ['master-data', 'tool-categories', 'selection'],
    queryFn: () =>
      apiClient.get<MasterDataRecord[]>(
        '/master-data/tool-categories/selection?page=1&pageSize=100',
      ),
    enabled: field.type === 'tool-category',
  });
  return (
    <Form.Item
      name={['attributes', field.key]}
      label={field.label}
      rules={[{ required: field.required }]}
    >
      {field.type === 'tool-category' ? (
        <Select
          loading={categories.isLoading}
          showSearch
          optionFilterProp="label"
          options={categories.data?.map((item) => ({
            value: item.id,
            label: `${item.code} — ${item.name}`,
          }))}
        />
      ) : field.type === 'select' ? (
        <Select options={field.options?.map((value) => ({ value, label: value }))} />
      ) : (
        <Input />
      )}
    </Form.Item>
  );
}

function ScopeFields({
  form,
  departmentScope,
}: {
  form: ReturnType<typeof Form.useForm<FormValue>>[0];
  departmentScope?: boolean;
}) {
  const scopeType = Form.useWatch('scopeType', form) ?? 'GLOBAL';
  const siteId = Form.useWatch('siteId', form);
  const rigId = Form.useWatch('rigId', form);
  const sites = useScopeOptions('SITE');
  const rigs = useScopeOptions('RIG', siteId);
  const departments = useScopeOptions('DEPARTMENT', siteId, rigId);
  return (
    <>
      <Form.Item name="scopeType" label="Scope" rules={[{ required: true }]}>
        <Select
          options={['GLOBAL', 'SITE', 'RIG', ...(departmentScope ? ['DEPARTMENT'] : [])].map(
            (value) => ({ value, label: value }),
          )}
          onChange={() =>
            form.setFieldsValue({ siteId: undefined, rigId: undefined, departmentId: undefined })
          }
        />
      </Form.Item>
      {scopeType !== 'GLOBAL' ? (
        <Form.Item name="siteId" label="Site" rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label" options={sites.data?.map(option)} />
        </Form.Item>
      ) : null}
      {scopeType === 'RIG' || scopeType === 'DEPARTMENT' ? (
        <Form.Item
          name="rigId"
          label="Rig (optional for site-level departments)"
          rules={[{ required: scopeType === 'RIG' }]}
        >
          <Select allowClear showSearch optionFilterProp="label" options={rigs.data?.map(option)} />
        </Form.Item>
      ) : null}
      {scopeType === 'DEPARTMENT' ? (
        <Form.Item name="departmentId" label="Department" rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label" options={departments.data?.map(option)} />
        </Form.Item>
      ) : null}
    </>
  );
}
function useScopeOptions(type: 'SITE' | 'RIG' | 'DEPARTMENT', siteId?: string, rigId?: string) {
  return useQuery({
    queryKey: ['scope-options', type, siteId, rigId],
    queryFn: () =>
      apiClient.get<OrganizationOption[]>(
        `/master-data/scope-options/list?type=${type}${siteId ? `&siteId=${siteId}` : ''}${rigId ? `&rigId=${rigId}` : ''}`,
      ),
    enabled: type === 'SITE' || Boolean(siteId),
  });
}
const option = (item: OrganizationOption) => ({
  value: item.id,
  label: `${item.code} — ${item.name}`,
});
