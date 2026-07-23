import {
  Alert,
  Button,
  Card,
  Input,
  Modal,
  Space,
  Spin,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCurrentUser } from '../auth/auth-context';
import type { ApiClientError } from '../../services/api-client';
import { workflowApi } from './workflow-api';
import './workflow.css';
export function WorkflowReviewPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<'return' | 'reject' | 'comment'>();
  const [comment, setComment] = useState('');
  const query = useQuery({
    queryKey: ['workflow-detail', id],
    queryFn: () => workflowApi.detail(id),
  });
  const mutation = useMutation({
    mutationFn: (action: 'approve' | 'return' | 'reject' | 'comment') =>
      workflowApi.action(id, action, comment),
    onSuccess: () => {
      setDialog(undefined);
      setComment('');
      void qc.invalidateQueries({ queryKey: ['workflow-detail', id] });
      void qc.invalidateQueries({ queryKey: ['workflow-queue'] });
      message.success('Workflow action completed');
    },
    onError: (e) => message.error((e as ApiClientError).message),
  });
  if (query.isLoading) return <Spin />;
  if (query.error || !query.data)
    return <Alert type="error" showIcon message="Workflow could not be loaded" />;
  const detail = query.data;
  const assigned = detail.status === 'ACTIVE' && detail.currentAssigneeUserId === user?.userId;
  return (
    <main className="workflow-page">
      <Button onClick={() => navigate(-1)}>Back</Button>
      <Typography.Text className="eyebrow">WORKFLOW REVIEW</Typography.Text>
      <Typography.Title level={1}>{detail.jsaNumber}</Typography.Title>
      <Space wrap>
        <Tag>{detail.versionStatus}</Tag>
        <Tag>Cycle {detail.cycleNumber}</Tag>
        {detail.currentStepName && <Tag color="blue">{detail.currentStepName}</Tag>}
      </Space>
      <Card
        title={detail.jobTitle || 'JSA'}
        extra={<Button onClick={() => navigate(`/jsa/${id}/draft`)}>Open read-only JSA</Button>}
      >
        <Typography.Paragraph>
          The JSA content is immutable while approval is active. Review the complete worksheet
          before taking action.
        </Typography.Paragraph>
        {assigned && (
          <Space wrap>
            <Button
              type="primary"
              loading={mutation.isPending}
              onClick={() => mutation.mutate('approve')}
            >
              Approve
            </Button>
            <Button onClick={() => setDialog('return')}>Return</Button>
            <Button danger onClick={() => setDialog('reject')}>
              Reject
            </Button>
          </Space>
        )}
        <Button onClick={() => setDialog('comment')}>Add comment</Button>
      </Card>
      <Card title="Approval history">
        <Timeline
          items={detail.actions.map((a) => ({
            color: a.action === 'REJECT' ? 'red' : a.action === 'RETURN' ? 'orange' : 'green',
            children: (
              <>
                <strong>{a.action}</strong> · {a.actorUsername} ·{' '}
                {new Date(a.actionAt).toLocaleString()}
                <br />
                {a.comment}
              </>
            ),
          }))}
        />
      </Card>
      <Modal
        title={
          dialog === 'return'
            ? 'Return JSA'
            : dialog === 'reject'
              ? 'Reject JSA'
              : 'Add workflow comment'
        }
        open={Boolean(dialog)}
        okText={dialog === 'comment' ? 'Add comment' : dialog === 'return' ? 'Return' : 'Reject'}
        okButtonProps={{
          danger: dialog === 'reject',
          disabled: (dialog === 'return' || dialog === 'reject') && !comment.trim(),
        }}
        confirmLoading={mutation.isPending}
        onCancel={() => setDialog(undefined)}
        onOk={() => dialog && mutation.mutate(dialog)}
      >
        <Input.TextArea
          rows={5}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={dialog === 'comment' ? 'Comment' : 'Reason is required'}
        />
      </Modal>
    </main>
  );
}
