import { Alert, Button, Card, Form, Select, Space, Spin, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { OrganizationOption } from '@jsams/shared-types';
import type { ApiClientError } from '../../services/api-client';
import { jsaApi } from './jsa-api';
import type { CreateJsaDraftRequest } from './jsa-api';
import './jsa-draft.css';

export function JsaCreatePage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [siteId, setSiteId] = useState<string>();
  const [rigId, setRigId] = useState<string>();
  const sites = useQuery({
    queryKey: ['jsa-options', 'sites'],
    queryFn: () => jsaApi.options<OrganizationOption>('sites'),
  });
  const rigs = useQuery({
    queryKey: ['jsa-options', 'rigs', siteId],
    queryFn: () => jsaApi.options<OrganizationOption>('rigs', `?siteId=${siteId}`),
    enabled: Boolean(siteId),
  });
  const departments = useQuery({
    queryKey: ['jsa-options', 'departments', siteId, rigId],
    queryFn: () =>
      jsaApi.options<OrganizationOption>('departments', `?siteId=${siteId}&rigId=${rigId}`),
    enabled: Boolean(siteId && rigId),
  });
  const matrix = useQuery({
    queryKey: ['jsa-matrix', rigId],
    queryFn: () => jsaApi.matrix(rigId!),
    enabled: Boolean(rigId),
  });
  const create = useMutation({
    mutationFn: (values: CreateJsaDraftRequest) => jsaApi.create(values),
    onSuccess: (draft) => navigate(`/jsa/${draft.jsaId}/draft`),
  });
  const options = (items?: Array<{ id: string; code: string; name: string }>) =>
    items?.map((item) => ({ value: item.id, label: `${item.code} — ${item.name}` }));
  const createError = create.error as ApiClientError | null;
  const errorDetails = createError?.details.map(String).filter(Boolean) ?? [];

  return (
    <main className="jsa-create">
      <Typography.Text className="eyebrow">JSA WORKSPACE</Typography.Text>
      <Typography.Title level={1}>Create JSA</Typography.Title>
      <Typography.Paragraph type="secondary">
        Choose the owning context once. Every source JSA is created in English, then the complete
        worksheet opens as one continuous screen.
      </Typography.Paragraph>
      {createError && (
        <Alert
          type="error"
          showIcon
          message={createError.message}
          description={
            <Space direction="vertical" size={0}>
              {errorDetails.map((detail) => (
                <Typography.Text key={detail}>{detail}</Typography.Text>
              ))}
              {createError.correlationId && (
                <Typography.Text type="secondary">
                  Correlation ID: {createError.correlationId}
                </Typography.Text>
              )}
            </Space>
          }
        />
      )}
      <Card>
        <Form<CreateJsaDraftRequest>
          form={form}
          layout="vertical"
          onFinish={({ ownerSiteId, rigId, departmentId }) =>
            create.mutate({ ownerSiteId, rigId, departmentId })
          }
        >
          <div className="jsa-form-grid">
            <Form.Item label="Owner Site" name="ownerSiteId" rules={[{ required: true }]}>
              <Select
                loading={sites.isLoading}
                options={options(sites.data)}
                onChange={(value) => {
                  setSiteId(value);
                  setRigId(undefined);
                  form.resetFields(['rigId', 'departmentId']);
                }}
              />
            </Form.Item>
            <Form.Item label="Rig" name="rigId" rules={[{ required: true }]}>
              <Select
                disabled={!siteId}
                loading={rigs.isLoading}
                options={options(rigs.data)}
                onChange={(value) => {
                  setRigId(value);
                  form.resetFields(['departmentId']);
                }}
              />
            </Form.Item>
            <Form.Item label="Department" name="departmentId" rules={[{ required: true }]}>
              <Select
                disabled={!rigId}
                loading={departments.isLoading}
                options={options(departments.data)}
              />
            </Form.Item>
            <div className="matrix-summary" aria-live="polite">
              <Typography.Text type="secondary">Effective Risk Matrix</Typography.Text>
              {matrix.isFetching ? (
                <Spin size="small" />
              ) : matrix.data ? (
                <strong>
                  {matrix.data.matrixCode} / {matrix.data.versionCode} · {matrix.data.dimension}×
                  {matrix.data.dimension}
                </strong>
              ) : (
                <span>Select a Rig</span>
              )}
            </div>
          </div>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              loading={create.isPending}
              disabled={!matrix.data?.completeness.complete}
            >
              Open JSA worksheet
            </Button>
            <Button onClick={() => navigate('/browse')}>Cancel</Button>
          </Space>
        </Form>
      </Card>
    </main>
  );
}
