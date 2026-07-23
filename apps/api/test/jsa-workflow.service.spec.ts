import type { AuthenticatedUser } from '@jsams/shared-types';
import { JsaWorkflowService } from '../src/modules/jsa-workflow/application/jsa-workflow.service';
import type { JsaWorkflowRepository } from '../src/modules/jsa-workflow/domain/jsa-workflow.repository';
const user: AuthenticatedUser = {
  userId: '1',
  enterpriseIdentityKey: 'creator',
  username: 'creator',
  displayName: 'Creator',
  roles: [],
  permissions: ['SUBMIT', 'APPROVE', 'RETURN', 'REJECT', 'COMMENT', 'VIEW', 'ADMIN'],
  permissionOverrides: [],
  dataScopes: [],
  authentication: { mode: 'development' },
};
const target = {
  jsaId: '10',
  versionId: '11',
  jsaNumber: 'JSA-10',
  siteId: '1',
  rigId: '2',
  departmentId: '3',
  jobTypeId: '4',
  creatorUserId: '1',
  masterStatus: 'DRAFT',
  versionStatus: 'DRAFT' as const,
  masterRowVersion: '1',
  versionRowVersion: '1',
};
const step = {
  stepId: '21',
  order: 1,
  code: 'DH',
  name: 'Department Head',
  versionStatus: 'DEPARTMENT_HEAD_REVIEW' as const,
  roleCode: 'DEPARTMENT_HEAD',
  optional: false,
  conditionType: 'ALWAYS' as const,
};
describe('JsaWorkflowService', () => {
  const oracle = { withTransaction: jest.fn(async (fn: (c: unknown) => unknown) => fn({})) };
  const repository = {
    target: jest.fn(),
    bindings: jest.fn(),
    steps: jest.fn(),
    assignees: jest.fn(),
    submissionIssues: jest.fn(),
    runtime: jest.fn(),
    begin: jest.fn(),
    resubmit: jest.fn(),
    action: jest.fn(),
    listQueue: jest.fn(),
    detail: jest.fn(),
    definitions: jest.fn(),
    saveDefinition: jest.fn(),
    notifications: jest.fn(),
  };
  const capabilities = { require: jest.fn(), code: jest.fn(() => 'APPROVE'), state: jest.fn() };
  const scopes = { allows: jest.fn(() => true) };
  const config = { get: jest.fn(() => 'test') };
  const audit = { recordRequired: jest.fn() };
  const service = new JsaWorkflowService(
    oracle as never,
    repository as unknown as JsaWorkflowRepository,
    capabilities as never,
    scopes as never,
    config as never,
    audit as never,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    repository.target.mockResolvedValue(target);
    repository.bindings.mockResolvedValue([
      {
        bindingId: '31',
        definitionId: '20',
        definitionCode: 'DEFAULT',
        definitionVersion: 1,
        priority: 1,
        specificity: 4,
      },
    ]);
    repository.steps.mockResolvedValue([step]);
    repository.assignees.mockResolvedValue([
      { userId: '2', displayName: 'Approver', specificity: 2 },
    ]);
    repository.submissionIssues.mockResolvedValue([]);
    repository.runtime.mockResolvedValue(undefined);
    repository.begin.mockResolvedValue('40');
    repository.detail.mockResolvedValue({
      instanceId: '40',
      ownerSiteId: '1',
      rigId: '2',
      departmentId: '3',
    });
  });
  it('previews a deterministic configured route', async () => {
    await expect(service.preview('10', user)).resolves.toMatchObject({
      configured: true,
      definitionCode: 'DEFAULT',
      steps: [{ assigneeUserId: '2', stepName: 'Department Head' }],
    });
  });
  it('fails closed when equally specific bindings are ambiguous', async () => {
    repository.bindings.mockResolvedValue([
      {
        bindingId: '31',
        definitionId: '20',
        definitionCode: 'A',
        definitionVersion: 1,
        priority: 1,
        specificity: 4,
      },
      {
        bindingId: '32',
        definitionId: '22',
        definitionCode: 'B',
        definitionVersion: 1,
        priority: 1,
        specificity: 4,
      },
    ]);
    await expect(service.preview('10', user)).resolves.toMatchObject({
      configured: false,
      errors: ['Workflow binding resolution is ambiguous'],
    });
  });
  it('blocks submission validation errors before creating workflow state', async () => {
    repository.submissionIssues.mockResolvedValue(['Hazard missing']);
    await expect(service.submit('10', user)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repository.begin).not.toHaveBeenCalled();
  });
  it('resubmits the same returned instance with a new cycle', async () => {
    repository.target.mockResolvedValue({ ...target, versionStatus: 'RETURNED' });
    repository.runtime.mockResolvedValue({
      instanceId: '40',
      cycleNumber: 1,
      definitionId: '20',
      bindingId: '31',
      status: 'RETURNED',
      versionStatus: 'RETURNED',
      target: { ...target, versionStatus: 'RETURNED' },
    });
    await service.submit('10', user);
    expect(repository.resubmit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ instanceId: '40' }),
      expect.anything(),
      '2',
      '1',
      'creator',
      expect.any(String),
    );
    expect(repository.begin).not.toHaveBeenCalled();
  });
  it('passes final approval to the atomic publication repository path', async () => {
    repository.runtime.mockResolvedValue({
      instanceId: '40',
      cycleNumber: 1,
      definitionId: '20',
      bindingId: '31',
      status: 'ACTIVE',
      currentStepOrder: 1,
      currentTaskId: '50',
      assigneeUserId: '1',
      stepId: '21',
      versionStatus: 'OIM_REVIEW',
      target: { ...target, versionStatus: 'OIM_REVIEW' },
    });
    repository.steps.mockResolvedValue([{ ...step, versionStatus: 'OIM_REVIEW' }]);
    await service.perform('10', 'APPROVE', undefined, user);
    expect(repository.action).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'APPROVE',
      undefined,
      undefined,
      undefined,
      '1',
      'creator',
      expect.any(String),
    );
  });
});
