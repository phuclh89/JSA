import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '@jsams/shared-types';
import {
  DataScopeDeniedError,
  ResourceNotFoundError,
  StateConflictError,
} from '../../../common/errors/application-errors';
import { OracleService } from '../../../common/oracle/oracle.service';
import { DataScopeService } from '../../security/application/data-scope.service';
import { SecurityAuditService } from '../../security/application/security-audit.service';
import {
  JSA_VERSIONING_REPOSITORY,
  type JsaVersioningRepository,
} from '../domain/jsa-versioning.repository';
import type { RevisionMaster } from '../domain/jsa-versioning.types';
import { JsaVersionCompareService } from './jsa-version-compare.service';
import { JsaVersioningCapabilityService } from './jsa-versioning-capability.service';

@Injectable()
export class JsaVersioningService {
  constructor(
    private readonly oracle: OracleService,
    @Inject(JSA_VERSIONING_REPOSITORY) private readonly repository: JsaVersioningRepository,
    private readonly capabilities: JsaVersioningCapabilityService,
    private readonly compareEngine: JsaVersionCompareService,
    private readonly scopes: DataScopeService,
    private readonly config: ConfigService,
    private readonly audit: SecurityAuditService,
  ) {}

  capabilityState(user: AuthenticatedUser) {
    return this.capabilities.state(user);
  }

  async checkout(jsaId: string, user: AuthenticatedUser) {
    this.capabilities.require(user, 'update');
    const result = await this.oracle.withTransaction(async (context) => {
      const master = await this.requiredMaster(context, jsaId, user, 'ACT', true);
      if (!master.currentVersionId || master.currentStatus !== 'PUBLISHED')
        throw new StateConflictError('Checkout requires a Current Published Version');
      if (master.workingVersionId)
        throw new StateConflictError('This JSA already has a Working Version');
      this.requireOwnerSite(master);
      return this.repository.checkout(context, master, user);
    });
    await this.audit.recordRequired({
      actorUserId: user.userId,
      enterpriseUsername: user.username,
      actionCode: 'JSA_REVISION_CHECKED_OUT',
      targetType: 'JSA_MASTER',
      targetId: jsaId,
      nextState: result,
    });
    return result;
  }

  async undoCheckout(jsaId: string, reason: string | undefined, user: AuthenticatedUser) {
    this.capabilities.require(user, 'undoCheckout');
    await this.oracle.withTransaction(async (context) => {
      const master = await this.requiredMaster(context, jsaId, user, 'ACT', true);
      this.requireOwnerSite(master);
      if (
        !master.workingVersionId ||
        !master.baseVersionId ||
        master.workingStatus !== 'DRAFT'
      )
        throw new StateConflictError('Undo Checkout is allowed only before submission');
      if (await this.repository.hasPendingTask(context, master.workingVersionId))
        throw new StateConflictError('Active approval cannot be undone');
      await this.repository.undo(context, master, user.username);
    });
    await this.audit.recordRequired({
      actorUserId: user.userId,
      enterpriseUsername: user.username,
      actionCode: 'JSA_REVISION_CHECKOUT_UNDONE',
      targetType: 'JSA_MASTER',
      targetId: jsaId,
      nextState: { reason: reason?.trim() || undefined },
    });
    return { jsaId, status: 'PUBLISHED' };
  }

  async compare(jsaId: string, user: AuthenticatedUser, workflowReview = false) {
    if (!workflowReview) this.capabilities.require(user, 'compare');
    const result = await this.oracle.withTransaction(async (context) => {
      const master = await this.requiredMaster(context, jsaId, user, 'VIEW');
      if (!master.workingVersionId || !master.baseVersionId)
        throw new StateConflictError('This JSA does not have a revision to compare');
      const [base, working] = await Promise.all([
        this.repository.snapshots(context, jsaId, master.baseVersionId),
        this.repository.snapshots(context, jsaId, master.workingVersionId),
      ]);
      return this.compareEngine.compare(
        jsaId,
        master.baseVersionId,
        master.workingVersionId,
        base,
        working,
      );
    });
    return result;
  }

  async history(jsaId: string, user: AuthenticatedUser) {
    this.capabilities.require(user, 'compare');
    const context = await this.oracle.withTransaction(async (transaction) => {
      await this.requiredMaster(transaction, jsaId, user, 'VIEW');
      return this.repository.history(transaction, jsaId);
    });
    return context;
  }

  private async requiredMaster(
    context: any,
    jsaId: string,
    user: AuthenticatedUser,
    access: 'VIEW' | 'ACT',
    lock = false,
  ) {
    const master = await this.repository.master(context, jsaId, lock);
    if (!master) throw new ResourceNotFoundError('JSA was not found');
    if (
      !this.scopes.allows(
        user,
        {
          scopeType: 'DEPARTMENT',
          siteId: master.siteId,
          rigId: master.rigId,
          departmentId: master.departmentId,
        },
        access,
      )
    )
      throw new DataScopeDeniedError();
    return master;
  }

  private requireOwnerSite(master: RevisionMaster) {
    const localSite = this.config.get<string>('app.siteId');
    if (localSite && localSite !== master.siteId)
      throw new DataScopeDeniedError();
  }
}
