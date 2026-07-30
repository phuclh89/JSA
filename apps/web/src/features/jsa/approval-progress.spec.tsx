import { render, screen } from '@testing-library/react';
import type { WorkflowStepPreview } from '@jsams/shared-types';
import { ApprovalProgress } from './approval-progress';

const steps: WorkflowStepPreview[] = [
  {
    stepId: '1',
    stepOrder: 1,
    stepCode: 'DEPARTMENT_HEAD',
    stepName: 'Department Head',
    versionStatus: 'DEPARTMENT_HEAD_REVIEW',
    workflowRoleCode: 'DEPARTMENT_HEAD',
    assigneeUserId: '10',
    assigneeName: 'Department Head User',
  },
  {
    stepId: '2',
    stepOrder: 2,
    stepCode: 'STC',
    stepName: 'STC',
    versionStatus: 'STC_REVIEW',
    workflowRoleCode: 'STC',
    assigneeUserId: '11',
    assigneeName: 'STC User',
  },
  {
    stepId: '3',
    stepOrder: 3,
    stepCode: 'OIM',
    stepName: 'OIM',
    versionStatus: 'OIM_REVIEW',
    workflowRoleCode: 'OIM',
    assigneeUserId: '12',
    assigneeName: 'OIM User',
  },
  {
    stepId: '4',
    stepOrder: 4,
    stepCode: 'RIG_MANAGER',
    stepName: 'Rig Manager',
    versionStatus: 'RIG_MANAGER_REVIEW',
    workflowRoleCode: 'RIG_MANAGER',
    assigneeUserId: '13',
    assigneeName: 'Rig Manager User',
  },
];

describe('ApprovalProgress', () => {
  it('shows the configured route including optional Rig Manager and current STC step', () => {
    render(<ApprovalProgress versionStatus="STC_REVIEW" steps={steps} configured />);

    expect(screen.getByLabelText('JSA approval status')).toBeInTheDocument();
    expect(screen.getByText('Creator')).toBeInTheDocument();
    expect(screen.getByText('Department Head')).toBeInTheDocument();
    expect(screen.getByText('STC')).toBeInTheDocument();
    expect(screen.getByText('OIM')).toBeInTheDocument();
    expect(screen.getByText('Rig Manager')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('STC Review')).toBeInTheDocument();
    expect(screen.getByText('Waiting for STC Review approval.')).toBeInTheDocument();
    expect(screen.getByText('STC').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('marks a Returned JSA as back with the Creator', () => {
    render(<ApprovalProgress versionStatus="RETURNED" steps={steps.slice(0, 3)} configured />);

    expect(screen.getByText('Returned')).toBeInTheDocument();
    expect(
      screen.getByText('The JSA has been returned to the Creator for revision.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Creator').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByText('Rig Manager')).not.toBeInTheDocument();
  });
});
