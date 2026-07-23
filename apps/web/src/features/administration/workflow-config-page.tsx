import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Space,
  Spin,
  Table,
  Typography,
  message,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkflowDefinitionSummary, WorkflowRoleAssignment } from '@jsams/shared-types';
import { workflowApi } from '../jsa/workflow-api';
import '../jsa/workflow.css';
export function WorkflowConfigPage() {
  const [form] = Form.useForm();
  const [roleForm] = Form.useForm();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['workflow-definitions'], queryFn: workflowApi.definitions });
  const roles = useQuery({
    queryKey: ['workflow-role-assignments'],
    queryFn: workflowApi.roleAssignments,
  });
  const save = useMutation({
    mutationFn: (value: any) =>
      workflowApi.saveDefinition({
        ...value,
        status: 'DRAFT',
        steps: [
          {
            order: 1,
            code: 'DEPARTMENT_HEAD',
            name: 'Department Head',
            versionStatus: 'DEPARTMENT_HEAD_REVIEW',
            roleCode: value.departmentHeadRole,
          },
          {
            order: 2,
            code: 'STC',
            name: 'STC',
            versionStatus: 'STC_REVIEW',
            roleCode: value.stcRole,
          },
          {
            order: 3,
            code: 'OIM',
            name: 'OIM',
            versionStatus: 'OIM_REVIEW',
            roleCode: value.oimRole,
          },
        ],
        bindings: [
          {
            priority: 100,
            effectiveFrom: new Date().toISOString(),
            active: true,
            ...(value.siteId ? { siteId: value.siteId } : {}),
          },
        ],
      }),
    onSuccess: () => {
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['workflow-definitions'] });
      message.success('Draft workflow definition saved');
    },
    onError: () => message.error('Workflow definition could not be saved'),
  });
  const saveRole = useMutation({
    mutationFn: (value: any) =>
      workflowApi.saveRoleAssignment({
        ...value,
        effectiveFrom: new Date().toISOString(),
        active: true,
      }),
    onSuccess: () => {
      roleForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['workflow-role-assignments'] });
      message.success('Workflow role assignment saved');
    },
    onError: () => message.error('Workflow role assignment could not be saved'),
  });
  return (
    <main className="workflow-page">
      <Typography.Text className="eyebrow">GOVERNED CONFIGURATION</Typography.Text>
      <Typography.Title level={1}>Approval Workflow</Typography.Title>
      <Alert
        type="info"
        showIcon
        message="Definitions are versioned"
        description="Production activation requires approved bindings, deterministic role assignments, permissions and data scopes. The optional Rig Manager condition remains fail-closed until confirmed."
      />
      <Card title="New draft definition">
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Space wrap align="start">
            <Form.Item name="code" label="Code" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item
              name="versionNumber"
              label="Version"
              initialValue={1}
              rules={[{ required: true }]}
            >
              <InputNumber min={1} />
            </Form.Item>
            <Form.Item name="name" label="Name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="siteId" label="Site ID (optional)">
              <Input />
            </Form.Item>
          </Space>
          <Space wrap>
            <Form.Item
              name="departmentHeadRole"
              label="Department Head workflow role"
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item name="stcRole" label="STC workflow role" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="oimRole" label="OIM workflow role" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Space>
          <Button type="primary" htmlType="submit" loading={save.isPending}>
            Save Draft
          </Button>
        </Form>
      </Card>
      <Card title="Workflow role assignment">
        <Form form={roleForm} layout="vertical" onFinish={(value) => saveRole.mutate(value)}>
          <Space wrap align="start">
            <Form.Item name="workflowRoleCode" label="Workflow role" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="userId" label="User ID" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="siteId" label="Site ID" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="rigId" label="Rig ID">
              <Input />
            </Form.Item>
            <Form.Item name="departmentId" label="Department ID">
              <Input />
            </Form.Item>
          </Space>
          <Button type="primary" htmlType="submit" loading={saveRole.isPending}>
            Assign workflow role
          </Button>
        </Form>
        <Table<WorkflowRoleAssignment>
          rowKey="id"
          loading={roles.isLoading}
          dataSource={roles.data ?? []}
          columns={[
            { title: 'Workflow role', dataIndex: 'workflowRoleCode' },
            { title: 'User', dataIndex: 'userName' },
            { title: 'Site', dataIndex: 'siteId' },
            { title: 'Rig', dataIndex: 'rigId', render: (value) => value || 'All' },
            {
              title: 'Department',
              dataIndex: 'departmentId',
              render: (value) => value || 'All',
            },
            { title: 'Active', dataIndex: 'active', render: (value) => (value ? 'Yes' : 'No') },
          ]}
        />
      </Card>
      {query.isLoading ? (
        <Spin />
      ) : (
        <Card title="Definitions">
          <Table<WorkflowDefinitionSummary>
            rowKey="id"
            dataSource={query.data ?? []}
            columns={[
              { title: 'Code', dataIndex: 'code' },
              { title: 'Version', dataIndex: 'versionNumber' },
              { title: 'Name', dataIndex: 'name' },
              { title: 'Status', dataIndex: 'status' },
              { title: 'Steps', dataIndex: 'stepCount' },
              { title: 'Bindings', dataIndex: 'bindingCount' },
            ]}
          />
        </Card>
      )}
    </main>
  );
}
