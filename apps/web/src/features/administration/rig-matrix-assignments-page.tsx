import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  OrganizationOption,
  RigMatrixAssignment,
  RiskMatrixVersionOption,
} from '@jsams/shared-types';
import { Alert, Button, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import type { ApiClientError } from '../../services/api-client';
import { apiClient } from '../../services/api-client';
import './administration.css';

interface AssignmentForm {
  rigId: string;
  matrixVersionId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  reason: string;
  rowVersion?: string;
}
interface EndForm {
  effectiveTo: string;
  reason: string;
  rowVersion: string;
}
export function RigMatrixAssignmentsPage() {
  const client = useQueryClient();
  const [rigFilter, setRigFilter] = useState<string>();
  const [editing, setEditing] = useState<RigMatrixAssignment>();
  const [open, setOpen] = useState(false);
  const [ending, setEnding] = useState<RigMatrixAssignment>();
  const [form] = Form.useForm<AssignmentForm>();
  const [endForm] = Form.useForm<EndForm>();
  const rigs = useQuery({
    queryKey: ['scope-options', 'RIG'],
    queryFn: () => apiClient.get<OrganizationOption[]>('/master-data/scope-options/list?type=RIG'),
  });
  const versions = useQuery({
    queryKey: ['risk-matrix-versions'],
    queryFn: () => apiClient.get<RiskMatrixVersionOption[]>('/risk-matrix-versions'),
  });
  const assignments = useQuery({
    queryKey: ['rig-matrix-assignments', rigFilter],
    queryFn: () =>
      apiClient.get<{ items: RigMatrixAssignment[]; total: number }>(
        `/rig-matrix-assignments${rigFilter ? `?rigId=${rigFilter}` : ''}`,
      ),
  });
  const mutation = useMutation({
    mutationFn: (value: AssignmentForm) =>
      editing
        ? apiClient.put<RigMatrixAssignment, AssignmentForm>(
            `/rig-matrix-assignments/${editing.id}`,
            { ...value, rowVersion: editing.rowVersion },
          )
        : apiClient.post<RigMatrixAssignment, AssignmentForm>('/rig-matrix-assignments', value),
    onSuccess: () => {
      setOpen(false);
      setEditing(undefined);
      form.resetFields();
      void client.invalidateQueries({ queryKey: ['rig-matrix-assignments'] });
    },
  });
  const endMutation = useMutation({
    mutationFn: (value: EndForm) =>
      apiClient.post<RigMatrixAssignment, EndForm>(
        `/rig-matrix-assignments/${ending?.id}/end`,
        value,
      ),
    onSuccess: () => {
      setEnding(undefined);
      endForm.resetFields();
      void client.invalidateQueries({ queryKey: ['rig-matrix-assignments'] });
    },
  });
  const begin = (record?: RigMatrixAssignment) => {
    setEditing(record);
    form.setFieldsValue(
      record
        ? {
            rigId: record.rigId,
            matrixVersionId: record.matrixVersionId,
            effectiveFrom: toLocal(record.effectiveFrom),
            effectiveTo: record.effectiveTo ? toLocal(record.effectiveTo) : undefined,
            reason: record.reason,
          }
        : ({ rigId: rigFilter, reason: '' } as AssignmentForm),
    );
    setOpen(true);
  };
  const error = mutation.error as ApiClientError | undefined;
  return (
    <section className="admin-page">
      <header className="admin-page-header">
        <div>
          <Typography.Title level={1}>Rig Matrix Assignments</Typography.Title>
          <Typography.Paragraph type="secondary">
            Effective-dated assignments are serialized per Rig. Incomplete Matrix Versions cannot be
            assigned.
          </Typography.Paragraph>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => begin()}>
          Create assignment
        </Button>
      </header>
      <div className="admin-filters">
        <Select
          aria-label="Filter by Rig"
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="All authorized Rigs"
          value={rigFilter}
          onChange={setRigFilter}
          options={rigs.data?.map(option)}
        />
      </div>
      <div className="admin-table-wrap">
        <Table
          rowKey="id"
          loading={assignments.isLoading}
          dataSource={assignments.data?.items ?? []}
          pagination={{ pageSize: 20 }}
          scroll={{ x: 1100 }}
          columns={[
            { title: 'Rig', render: (_: unknown, r: RigMatrixAssignment) => r.rigCode },
            {
              title: 'Matrix Version',
              render: (_: unknown, r: RigMatrixAssignment) => `${r.matrixCode} · ${r.versionCode}`,
            },
            {
              title: 'Dimension',
              render: (_: unknown, r: RigMatrixAssignment) => `${r.dimension}×${r.dimension}`,
            },
            {
              title: 'Effective from',
              render: (_: unknown, r: RigMatrixAssignment) =>
                new Date(r.effectiveFrom).toLocaleString(),
            },
            {
              title: 'Effective to',
              render: (_: unknown, r: RigMatrixAssignment) =>
                r.effectiveTo ? new Date(r.effectiveTo).toLocaleString() : 'Open-ended',
            },
            {
              title: 'Period state',
              render: (_: unknown, r: RigMatrixAssignment) => <Tag>{periodState(r)}</Tag>,
            },
            { title: 'Reason', dataIndex: 'reason' },
            {
              title: 'Actions',
              render: (_: unknown, r: RigMatrixAssignment) => (
                <Space wrap>
                  <Button
                    disabled={Date.parse(r.effectiveFrom) <= Date.now()}
                    title={
                      Date.parse(r.effectiveFrom) <= Date.now()
                        ? 'Only future assignments may be edited'
                        : undefined
                    }
                    onClick={() => begin(r)}
                  >
                    Edit future
                  </Button>
                  <Button
                    onClick={() => {
                      setEnding(r);
                      endForm.setFieldsValue({
                        effectiveTo: toLocal(new Date().toISOString()),
                        reason: '',
                        rowVersion: r.rowVersion,
                      });
                    }}
                  >
                    End assignment
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </div>
      <Modal
        title={editing ? 'Edit future assignment' : 'Create Rig Matrix assignment'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={mutation.isPending}
      >
        {error ? (
          <Alert
            type="error"
            showIcon
            message={error.message}
            description={
              error.code === 'RIG_MATRIX_ASSIGNMENT_OVERLAP'
                ? 'The entered period conflicts with another assignment. Your values have been retained for correction.'
                : error.code
            }
          />
        ) : null}
        <Form
          form={form}
          layout="vertical"
          onFinish={(value) =>
            mutation.mutate({
              ...value,
              effectiveFrom: new Date(value.effectiveFrom).toISOString(),
              ...(value.effectiveTo
                ? { effectiveTo: new Date(value.effectiveTo).toISOString() }
                : {}),
            })
          }
        >
          <Form.Item name="rigId" label="Rig" rules={[{ required: true }]}>
            <Select
              disabled={Boolean(editing)}
              showSearch
              optionFilterProp="label"
              options={rigs.data?.map(option)}
            />
          </Form.Item>
          <Form.Item
            name="matrixVersionId"
            label="Complete Matrix Version"
            rules={[{ required: true }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={versions.data?.map((item) => ({
                value: item.id,
                label: `${item.matrixCode} · ${item.versionCode} · ${item.dimension}×${item.dimension}${item.complete ? '' : ' · Incomplete'}`,
                disabled: !item.complete || !item.active,
              }))}
            />
          </Form.Item>
          <Form.Item name="effectiveFrom" label="Effective from" rules={[{ required: true }]}>
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="effectiveTo" label="Effective to (optional)">
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item
            name="reason"
            label="Reason for assignment or change"
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="End Rig Matrix assignment"
        open={Boolean(ending)}
        onCancel={() => setEnding(undefined)}
        onOk={() => endForm.submit()}
        confirmLoading={endMutation.isPending}
      >
        {endMutation.error ? (
          <Alert type="error" message={(endMutation.error as ApiClientError).message} />
        ) : null}
        <Form
          form={endForm}
          layout="vertical"
          onFinish={(value) =>
            endMutation.mutate({ ...value, effectiveTo: new Date(value.effectiveTo).toISOString() })
          }
        >
          <Form.Item name="effectiveTo" label="End time" rules={[{ required: true }]}>
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="reason" label="Reason" rules={[{ required: true }]}>
            <Input.TextArea />
          </Form.Item>
          <Form.Item name="rowVersion" hidden>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}
const option = (item: OrganizationOption) => ({
  value: item.id,
  label: `${item.code} — ${item.name}`,
});
const toLocal = (value: string) => {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
const periodState = (item: RigMatrixAssignment) => {
  const now = Date.now();
  if (Date.parse(item.effectiveFrom) > now) return 'Future';
  if (item.effectiveTo && Date.parse(item.effectiveTo) <= now) return 'Historical';
  return 'Current';
};
