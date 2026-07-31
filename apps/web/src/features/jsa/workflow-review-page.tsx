import { Alert, Button, Card, Input, Modal, Space, Spin, Tag, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCurrentUser } from '../auth/auth-context';
import type { ApiClientError } from '../../services/api-client';
import { workflowApi } from './workflow-api';
import { ApprovalProgress } from './approval-progress';
import { ApprovalHistory } from './approval-history';
import { JsaDraftEditor } from './jsa-draft-editor';
import './workflow.css';
import { VersionComparePanel } from './version-compare-panel';
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
  const preview = useQuery({
    queryKey: ['workflow-preview', id],
    queryFn: () => workflowApi.preview(id),
  });
  const mutation = useMutation({
    mutationFn: (action: 'approve' | 'return' | 'reject' | 'comment') =>
      workflowApi.action(id, action, comment),
    onSuccess: () => {
      setDialog(undefined);
      setComment('');
      void qc.invalidateQueries({ queryKey: ['workflow-detail', id] });
      void qc.invalidateQueries({ queryKey: ['workflow-queue'] });
      void qc.invalidateQueries({ queryKey: ['jsa-navigation-counts'] });
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
      <Typography.Text type="secondary">
        {detail.versionStatus === 'PUBLISHED' ? 'Official JSA Number' : 'Temporary JSA Number'}
      </Typography.Text>
      <Typography.Title level={1}>{detail.jsaNumber}</Typography.Title>
      <Space wrap>
        <Tag>{detail.versionStatus}</Tag>
        <Tag>Cycle {detail.cycleNumber}</Tag>
        {detail.currentStepName && <Tag color="blue">{detail.currentStepName}</Tag>}
        {detail.versionStatus === 'PUBLISHED' ? (
          <Button
            type="primary"
            onClick={() =>
              window.open(`/jsa/${detail.jsaId}/print`, '_blank', 'noopener,noreferrer')
            }
          >
            Print JSA
          </Button>
        ) : null}
      </Space>
      <ApprovalProgress
        versionStatus={detail.versionStatus}
        steps={preview.data?.steps}
        currentStepOrder={detail.currentStepOrder}
        currentStepName={detail.currentStepName}
        loading={preview.isLoading}
        configured={preview.data?.configured}
      />
      <Card className="workflow-action-card" title={detail.jobTitle || 'JSA approval decision'}>
        <Typography.Paragraph>
          Review the complete read-only worksheet below, then record the approval decision on this
          page.
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
      <section className="workflow-worksheet-section" aria-labelledby="workflow-worksheet-title">
        <div className="workflow-worksheet-heading">
          <div>
            <Typography.Title id="workflow-worksheet-title" level={2}>
              Complete JSA
            </Typography.Title>
            <Typography.Text type="secondary">
              This exact Working Version is read-only while approval is active.
            </Typography.Text>
          </div>
          <Tag>{detail.versionStatus}</Tag>
        </div>
        <JsaDraftEditor embedded forceReadOnly reviewComparison />
      </section>
      <ApprovalHistory actions={detail.actions} />
      {detail.baseVersionId ? (
        <VersionComparePanel
          jsaId={id}
          workflowReview
          defaultCollapsed
          legend={
            <div className="worksheet-change-legend" role="note">
              <span>
                <i className="worksheet-change-swatch worksheet-change-swatch--added" />
                Added since the Published Version
              </span>
              <span>
                <i className="worksheet-change-swatch worksheet-change-swatch--changed" />
                Changed since the Published Version
              </span>
              <span>
                <i className="worksheet-change-swatch worksheet-change-swatch--deleted" />
                Deleted from the Published Version
              </span>
            </div>
          }
        />
      ) : null}
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
