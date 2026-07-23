import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  RiskMatrixSummary,
  RiskMatrixVersionDetail,
  RiskMatrixVersionOption,
} from '@jsams/shared-types';
import { Alert, Button, Form, Input, Modal, Select, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiClientError } from '../../services/api-client';
import { apiClient } from '../../services/api-client';
import './administration.css';

interface MatrixForm {
  code: string;
  name: string;
  dimension: 3 | 5;
  description?: string;
  rowVersion?: string;
}
interface VersionForm {
  versionCode: string;
  description?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}
export function RiskMatricesPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [versionMatrix, setVersionMatrix] = useState<RiskMatrixSummary>();
  const [form] = Form.useForm<MatrixForm>();
  const [versionForm] = Form.useForm<VersionForm>();
  const matrices = useQuery({
    queryKey: ['risk-matrices'],
    queryFn: () => apiClient.get<{ items: RiskMatrixSummary[]; total: number }>('/risk-matrices'),
  });
  const versions = useQuery({
    queryKey: ['risk-matrix-versions'],
    queryFn: () => apiClient.get<RiskMatrixVersionOption[]>('/risk-matrix-versions'),
  });
  const create = useMutation({
    mutationFn: (value: MatrixForm) =>
      apiClient.post<RiskMatrixSummary, MatrixForm>('/risk-matrices', value),
    onSuccess: () => {
      setOpen(false);
      form.resetFields();
      void client.invalidateQueries({ queryKey: ['risk-matrices'] });
    },
  });
  const createVersion = useMutation({
    mutationFn: (value: VersionForm) =>
      apiClient.post<RiskMatrixVersionDetail, VersionForm>(
        `/risk-matrices/${versionMatrix?.id}/versions`,
        value,
      ),
    onSuccess: (value) => {
      setVersionMatrix(undefined);
      versionForm.resetFields();
      void client.invalidateQueries({ queryKey: ['risk-matrix-versions'] });
      navigate(`/operations/risk-matrices/${value.id}/editor`);
    },
  });
  return (
    <section className="admin-page">
      <header className="admin-page-header">
        <div>
          <Typography.Title level={1}>Risk Matrices</Typography.Title>
          <Typography.Paragraph type="secondary">
            Configure governed 3×3 and 5×5 Matrix Versions. Cell outcomes are lookup data, not
            formulas.
          </Typography.Paragraph>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Create Matrix
        </Button>
      </header>
      {matrices.error ? (
        <Alert type="error" showIcon message="Unable to load Risk Matrices" />
      ) : null}
      <div className="admin-table-wrap">
        <Table
          rowKey="id"
          loading={matrices.isLoading}
          dataSource={matrices.data?.items ?? []}
          pagination={false}
          scroll={{ x: 800 }}
          columns={[
            { title: 'Code', dataIndex: 'code' },
            { title: 'Matrix name', dataIndex: 'name' },
            {
              title: 'Dimension',
              render: (_: unknown, r: RiskMatrixSummary) => `${r.dimension}×${r.dimension}`,
            },
            { title: 'Versions', dataIndex: 'versionCount' },
            {
              title: 'Status',
              render: (_: unknown, r: RiskMatrixSummary) => (
                <Tag color={r.active ? 'green' : 'default'}>{r.active ? 'Active' : 'Inactive'}</Tag>
              ),
            },
            {
              title: 'Actions',
              render: (_: unknown, r: RiskMatrixSummary) => (
                <Button
                  disabled={!r.active}
                  title={!r.active ? 'Activate the Matrix before creating a version' : undefined}
                  onClick={() => setVersionMatrix(r)}
                >
                  Create Version
                </Button>
              ),
            },
          ]}
        />
      </div>
      <Typography.Title level={2}>Matrix Versions</Typography.Title>
      <div className="admin-table-wrap">
        <Table
          rowKey="id"
          loading={versions.isLoading}
          dataSource={versions.data ?? []}
          pagination={false}
          scroll={{ x: 800 }}
          columns={[
            { title: 'Matrix', dataIndex: 'matrixCode' },
            { title: 'Version', dataIndex: 'versionCode' },
            {
              title: 'Dimension',
              render: (_: unknown, r: RiskMatrixVersionOption) => `${r.dimension}×${r.dimension}`,
            },
            {
              title: 'Completeness',
              render: (_: unknown, r: RiskMatrixVersionOption) => (
                <Tag color={r.complete ? 'green' : 'gold'}>
                  {r.complete ? 'Complete' : 'Incomplete'}
                </Tag>
              ),
            },
            {
              title: 'State',
              render: (_: unknown, r: RiskMatrixVersionOption) =>
                r.immutable ? 'Effective / historical' : 'Editable',
            },
            {
              title: 'Actions',
              render: (_: unknown, r: RiskMatrixVersionOption) => (
                <Button onClick={() => navigate(`/operations/risk-matrices/${r.id}/editor`)}>
                  {r.immutable ? 'View' : 'Edit'}
                </Button>
              ),
            },
          ]}
        />
      </div>
      <Modal
        title="Create Risk Matrix"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={create.isPending}
      >
        {create.error ? (
          <Alert type="error" message={(create.error as ApiClientError).message} />
        ) : null}
        <Form
          form={form}
          layout="vertical"
          initialValues={{ dimension: 3 }}
          onFinish={(value) => create.mutate(value)}
        >
          <Form.Item name="code" label="Matrix code" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label="Matrix name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="dimension" label="Dimension" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 3, label: '3×3' },
                { value: 5, label: '5×5' },
              ]}
            />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={`Create version for ${versionMatrix?.code ?? ''}`}
        open={Boolean(versionMatrix)}
        onCancel={() => setVersionMatrix(undefined)}
        onOk={() => versionForm.submit()}
        confirmLoading={createVersion.isPending}
      >
        <Form
          form={versionForm}
          layout="vertical"
          onFinish={(value) => createVersion.mutate(value)}
        >
          <Form.Item name="versionCode" label="Version code" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea />
          </Form.Item>
          <Form.Item name="effectiveFrom" label="Configuration effective from">
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="effectiveTo" label="Configuration effective to">
            <Input type="datetime-local" />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}
