import {
  CheckOutlined,
  CloseCircleOutlined,
  EditOutlined,
  LoadingOutlined,
  RightOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import type { JsaVersionStatus, WorkflowStepPreview } from '@jsams/shared-types';
import { Tag, Typography } from 'antd';

interface ApprovalProgressProps {
  versionStatus: JsaVersionStatus;
  steps?: WorkflowStepPreview[];
  currentStepOrder?: number;
  currentStepName?: string;
  loading?: boolean;
  configured?: boolean;
}

interface ProgressNode {
  key: string;
  label: string;
  versionStatus?: JsaVersionStatus;
  assigneeName?: string;
}

const fallbackSteps: WorkflowStepPreview[] = [
  workflowStep(1, 'DEPARTMENT_HEAD', 'Department Head', 'DEPARTMENT_HEAD_REVIEW'),
  workflowStep(2, 'STC', 'STC', 'STC_REVIEW'),
  workflowStep(3, 'OIM', 'OIM', 'OIM_REVIEW'),
];

export function ApprovalProgress({
  versionStatus,
  steps,
  currentStepOrder,
  currentStepName,
  loading,
  configured,
}: ApprovalProgressProps) {
  const approvalSteps = steps?.length ? steps : fallbackSteps;
  const nodes: ProgressNode[] = [
    { key: 'creator', label: 'Creator', versionStatus: 'DRAFT' },
    ...approvalSteps.map((step) => ({
      key: step.stepId,
      label: step.stepName,
      versionStatus: step.versionStatus,
      assigneeName: step.assigneeName,
    })),
    { key: 'published', label: 'Published', versionStatus: 'PUBLISHED' },
  ];
  const terminal = ['REJECTED', 'CANCELLED'].includes(versionStatus);
  const currentIndex =
    versionStatus === 'PUBLISHED'
      ? nodes.length - 1
      : versionStatus === 'DRAFT' || versionStatus === 'RETURNED'
        ? 0
        : Math.max(
            0,
            nodes.findIndex((node) => node.versionStatus === versionStatus) >= 0
              ? nodes.findIndex((node) => node.versionStatus === versionStatus)
              : (currentStepOrder ?? 0),
          );

  return (
    <section className="approval-progress" aria-label="JSA approval status">
      <div className="approval-progress-heading">
        <div>
          <Typography.Text strong>Approval status</Typography.Text>
          <Typography.Text type="secondary">
            {statusDescription(versionStatus, currentStepName)}
          </Typography.Text>
        </div>
        <Tag color={statusColor(versionStatus)}>{statusLabel(versionStatus)}</Tag>
      </div>
      <ol className="approval-progress-track">
        {nodes.map((node, index) => {
          const state = terminal
            ? index === currentIndex
              ? 'stopped'
              : index < currentIndex
                ? 'complete'
                : 'upcoming'
            : index < currentIndex || versionStatus === 'PUBLISHED'
              ? 'complete'
              : index === currentIndex
                ? versionStatus === 'RETURNED'
                  ? 'returned'
                  : 'current'
                : 'upcoming';
          return (
            <li
              className={`approval-progress-step approval-progress-step--${state}`}
              key={node.key}
              aria-current={state === 'current' || state === 'returned' ? 'step' : undefined}
            >
              <span className="approval-progress-icon" aria-hidden="true">
                {loading && index > 0 && !steps?.length ? (
                  <LoadingOutlined />
                ) : state === 'complete' ? (
                  <CheckOutlined />
                ) : state === 'returned' ? (
                  <UndoOutlined />
                ) : state === 'stopped' ? (
                  <CloseCircleOutlined />
                ) : state === 'current' ? (
                  <EditOutlined />
                ) : (
                  <RightOutlined />
                )}
              </span>
              <span className="approval-progress-copy">
                <span>{node.label}</span>
                {node.assigneeName ? <small>{node.assigneeName}</small> : null}
              </span>
            </li>
          );
        })}
      </ol>
      {configured === false ? (
        <Typography.Text className="approval-progress-note" type="secondary">
          The approval route is not fully configured; the standard route is shown for reference.
        </Typography.Text>
      ) : null}
    </section>
  );
}

function workflowStep(
  order: number,
  code: string,
  name: string,
  versionStatus: JsaVersionStatus,
): WorkflowStepPreview {
  return {
    stepId: `fallback-${code}`,
    stepOrder: order,
    stepCode: code,
    stepName: name,
    versionStatus,
    workflowRoleCode: code,
    assigneeUserId: '',
    assigneeName: '',
  };
}

function statusLabel(status: JsaVersionStatus) {
  const labels: Record<JsaVersionStatus, string> = {
    DRAFT: 'Draft',
    DEPARTMENT_HEAD_REVIEW: 'Department Head Review',
    STC_REVIEW: 'STC Review',
    OIM_REVIEW: 'OIM Review',
    RIG_MANAGER_REVIEW: 'Rig Manager Review',
    RETURNED: 'Returned',
    REJECTED: 'Rejected',
    PUBLISHED: 'Published',
    CANCELLED: 'Cancelled',
  };
  return labels[status];
}

function statusDescription(status: JsaVersionStatus, currentStepName?: string) {
  if (status === 'DRAFT') return 'The Creator is preparing the JSA.';
  if (status === 'RETURNED') return 'The JSA has been returned to the Creator for revision.';
  if (status === 'PUBLISHED') return 'All required approvals are complete.';
  if (status === 'REJECTED') return 'The approval workflow ended with rejection.';
  if (status === 'CANCELLED') return 'This JSA was cancelled before publication.';
  return `Waiting for ${currentStepName ?? statusLabel(status)} approval.`;
}

function statusColor(status: JsaVersionStatus) {
  if (status === 'PUBLISHED') return 'green';
  if (status === 'REJECTED' || status === 'CANCELLED') return 'red';
  if (status === 'RETURNED') return 'orange';
  if (status === 'DRAFT') return 'lime';
  return 'blue';
}
