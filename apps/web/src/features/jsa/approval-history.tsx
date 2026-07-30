import type { WorkflowActionHistory } from '@jsams/shared-types';
import { Alert, Card, Empty, Spin, Tag, Timeline, Typography } from 'antd';
import './workflow.css';

export function ApprovalHistory({
  actions,
  loading = false,
  error,
}: {
  actions?: WorkflowActionHistory[];
  loading?: boolean;
  error?: boolean;
}) {
  return (
    <Card className="approval-history" title="Approval history" aria-label="Approval history">
      {error ? (
        <Alert
          type="error"
          showIcon
          message="Approval history could not be loaded"
          description="Refresh the page to try again."
        />
      ) : (
        <Spin spinning={loading}>
          {actions?.length ? (
            <Timeline
              items={actions.map((action) => ({
                color: actionColor(action.action),
                children: (
                  <article className="approval-history-entry">
                    <header>
                      <Tag color={actionColor(action.action)}>
                        {formatWorkflowText(action.action)}
                      </Tag>
                      <Typography.Text strong>{action.actorUsername}</Typography.Text>
                      <Typography.Text type="secondary">Cycle {action.cycleNumber}</Typography.Text>
                    </header>
                    {action.fromStatus || action.toStatus ? (
                      <div className="approval-history-transition">
                        {action.fromStatus ? formatWorkflowText(action.fromStatus) : 'Start'}
                        <span aria-hidden="true">→</span>
                        {action.toStatus ? formatWorkflowText(action.toStatus) : 'Completed'}
                      </div>
                    ) : null}
                    <time dateTime={action.actionAt}>
                      {new Date(action.actionAt).toLocaleString()}
                    </time>
                    {action.comment ? (
                      <blockquote>
                        <strong>Comment:</strong> {action.comment}
                      </blockquote>
                    ) : null}
                  </article>
                ),
              }))}
            />
          ) : !loading ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No approval action has been recorded"
            />
          ) : null}
        </Spin>
      )}
    </Card>
  );
}

function formatWorkflowText(value: string) {
  return value
    .toLocaleLowerCase()
    .split('_')
    .map((part) => `${part.charAt(0).toLocaleUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function actionColor(action: WorkflowActionHistory['action']) {
  if (action === 'REJECT') return 'red';
  if (action === 'RETURN') return 'orange';
  if (action === 'COMMENT') return 'blue';
  return 'green';
}
