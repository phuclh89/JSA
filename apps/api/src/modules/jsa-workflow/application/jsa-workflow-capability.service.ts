import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '@jsams/shared-types';
import { AccessDeniedError } from '../../../common/errors/application-errors';
import type { WorkflowPermission } from '../domain/jsa-workflow.types';
@Injectable()
export class JsaWorkflowCapabilityService {
  constructor(private readonly config: ConfigService) {}
  code(permission: WorkflowPermission): string | undefined {
    const keys: Record<WorkflowPermission, string> = {
      submit: 'JSA_PERMISSION_SUBMIT',
      approve: 'JSA_PERMISSION_APPROVE',
      return: 'JSA_PERMISSION_RETURN',
      reject: 'JSA_PERMISSION_REJECT',
      comment: 'JSA_PERMISSION_COMMENT',
      view: 'JSA_PERMISSION_WORKFLOW_VIEW',
      admin: 'JSA_PERMISSION_WORKFLOW_ADMIN',
    };
    return this.config.get<string>(keys[permission]);
  }
  require(user: AuthenticatedUser, permission: WorkflowPermission) {
    const code = this.code(permission);
    if (!code || !user.permissions.includes(code)) throw new AccessDeniedError();
  }
  state(user: AuthenticatedUser) {
    const permissions = [
      'submit',
      'approve',
      'return',
      'reject',
      'comment',
      'view',
      'admin',
    ] as WorkflowPermission[];
    const configured = permissions.every((x) => Boolean(this.code(x)));
    return {
      configured,
      ...Object.fromEntries(
        permissions.map((x) => [
          x,
          Boolean(this.code(x) && user.permissions.includes(this.code(x)!)),
        ]),
      ),
      ...(!configured
        ? { unavailableReason: 'Workflow permission-code mapping is not configured' }
        : {}),
    };
  }
}
