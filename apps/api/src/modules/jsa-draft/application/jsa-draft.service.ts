import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser, JsaDraftDetail } from '@jsams/shared-types';
import {
  DataScopeDeniedError,
  ResourceNotFoundError,
  StateConflictError,
  ValidationError,
} from '../../../common/errors/application-errors';
import { OracleService } from '../../../common/oracle/oracle.service';
import { DataScopeService } from '../../security/application/data-scope.service';
import { SecurityAuditService } from '../../security/application/security-audit.service';
import { RiskMatrixService } from '../../risk-matrix/application/risk-matrix.service';
import { MasterDataService } from '../../master-data/application/master-data.service';
import type { MasterDataKind } from '@jsams/shared-types';
import type {
  CreateDraftInput,
  SaveDraftContentInput,
  UpdateDraftHeaderInput,
} from '../domain/jsa-draft.types';
import { JSA_DRAFT_REPOSITORY, type JsaDraftRepository } from '../domain/jsa-draft.repository';
import { JsaCapabilityService } from './jsa-capability.service';
import { JsaNumberService } from './jsa-number.service';
import { JsaDraftValidationService } from './jsa-draft-validation.service';

@Injectable()
export class JsaDraftService {
  constructor(
    private readonly oracle: OracleService,
    @Inject(JSA_DRAFT_REPOSITORY) private readonly repository: JsaDraftRepository,
    private readonly capabilities: JsaCapabilityService,
    private readonly scopes: DataScopeService,
    private readonly numbers: JsaNumberService,
    private readonly riskMatrices: RiskMatrixService,
    private readonly masterData: MasterDataService,
    private readonly validation: JsaDraftValidationService,
    private readonly audit: SecurityAuditService,
  ) {}
  capabilityState(user: AuthenticatedUser) {
    return this.capabilities.capabilities(user);
  }
  options(
    kind: string,
    siteId: string | undefined,
    rigId: string | undefined,
    departmentId: string | undefined,
    user: AuthenticatedUser,
  ) {
    if (kind === 'sites' || kind === 'rigs' || kind === 'departments') {
      this.capabilities.require(user, 'create');
      return this.masterData.scopeOptions(
        kind === 'sites' ? 'SITE' : kind === 'rigs' ? 'RIG' : 'DEPARTMENT',
        siteId,
        rigId,
        user,
      );
    }
    this.capabilities.require(user, 'view');
    const allowed: MasterDataKind[] = [
      'job-types',
      'hazard-prompts',
      'positions',
      'tools',
      'languages',
      'procedure-references',
    ];
    if (!allowed.includes(kind as MasterDataKind))
      throw new ResourceNotFoundError('JSA selection catalogue was not found');
    return this.masterData.selection(
      kind as MasterDataKind,
      { page: 1, pageSize: 100, siteId, rigId, departmentId },
      user,
    );
  }
  async create(input: CreateDraftInput, user: AuthenticatedUser) {
    this.capabilities.require(user, 'create');
    this.assertIds(input);
    if (
      !this.scopes.allows(
        user,
        {
          scopeType: 'DEPARTMENT',
          siteId: input.ownerSiteId,
          rigId: input.rigId,
          departmentId: input.departmentId,
        },
        'ACT',
      )
    )
      throw new DataScopeDeniedError();
    const id = await this.oracle.withTransaction(async (context) => {
      const refs = await this.repository.validateCreate(context, input);
      const number = await this.numbers.next(context, input.ownerSiteId);
      return this.repository.create(
        context,
        input,
        refs.matrixVersionId,
        number,
        user.userId,
        user.username,
      );
    });
    await this.audit.recordRequired({
      actorUserId: user.userId,
      enterpriseUsername: user.username,
      actionCode: 'JSA_DRAFT_CREATED',
      targetType: 'JSA_MASTER',
      targetId: id,
      siteId: input.ownerSiteId,
      rigId: input.rigId,
      nextState: { status: 'DRAFT' },
    });
    return this.detail(id, user);
  }
  async detail(id: string, user: AuthenticatedUser): Promise<JsaDraftDetail> {
    this.capabilities.require(user, 'view');
    const raw = await this.oracle.withTransaction((context) => this.repository.load(context, id));
    if (!raw) throw new ResourceNotFoundError('JSA Draft was not found');
    this.requireScope(user, raw.header, 'VIEW');
    const matrix = await this.riskMatrices.version(raw.header.matrixVersionId);
    return {
      ...raw.header,
      prompts: raw.prompts,
      tasks: raw.tasks,
      basicSteps: raw.steps,
      promptCoverage: raw.coverage,
      procedureReferences: raw.procedures,
      attachments: raw.attachments,
      matrix,
      editable:
        raw.header.lifecycleStatus === 'DRAFT' &&
        ['DRAFT', 'RETURNED'].includes(raw.header.versionStatus) &&
        raw.header.creatorUserId === user.userId &&
        this.capabilities.capabilities(user).edit,
    };
  }
  async updateHeader(id: string, input: UpdateDraftHeaderInput, user: AuthenticatedUser) {
    this.capabilities.require(user, 'edit');
    await this.oracle.withTransaction(async (context) => {
      const access = await this.requireEditable(context, id, user);
      await this.repository.updateHeader(context, access, input, user.username);
    });
    await this.audit.recordRequired({
      actorUserId: user.userId,
      enterpriseUsername: user.username,
      actionCode: 'JSA_DRAFT_HEADER_UPDATED',
      targetType: 'JSA_MASTER',
      targetId: id,
    });
    return this.detail(id, user);
  }
  async saveContent(id: string, input: SaveDraftContentInput, user: AuthenticatedUser) {
    this.capabilities.require(user, 'edit');
    this.validation.structural(input);
    await this.oracle.withTransaction(async (context) => {
      const access = await this.requireEditable(context, id, user);
      await this.repository.saveContent(context, access, input, user.username);
    });
    await this.audit.recordRequired({
      actorUserId: user.userId,
      enterpriseUsername: user.username,
      actionCode: 'JSA_DRAFT_CONTENT_SAVED',
      targetType: 'JSA_MASTER',
      targetId: id,
    });
    return this.detail(id, user);
  }
  async validate(id: string, user: AuthenticatedUser) {
    const draft = await this.detail(id, user);
    const result = this.validation.validate(draft);
    await this.audit.recordRequired({
      actorUserId: user.userId,
      enterpriseUsername: user.username,
      actionCode: 'JSA_DRAFT_VALIDATED',
      targetType: 'JSA_MASTER',
      targetId: id,
      nextState: { valid: result.valid, errorCount: result.errors.length },
    });
    return result;
  }
  async resolveRisk(
    id: string,
    input: { likelihoodId?: string; severityId?: string },
    user: AuthenticatedUser,
  ) {
    this.capabilities.require(user, 'view');
    return this.oracle.withTransaction(async (context) => {
      const access = await this.repository.access(context, id);
      if (!access) throw new ResourceNotFoundError('Working JSA Draft was not found');
      this.requireScope(user, access, 'VIEW');
      const raw = await this.repository.load(context, id);
      return this.repository.resolveRisk(context, raw!.header.matrixVersionId, input);
    });
  }
  effectiveMatrix(rigId: string, user: AuthenticatedUser) {
    this.capabilities.require(user, 'create');
    return this.riskMatrices.resolveEffectiveMatrixVersion(rigId, new Date().toISOString(), user);
  }
  async cancel(id: string, rowVersion: string, versionRowVersion: string, user: AuthenticatedUser) {
    this.capabilities.require(user, 'cancel');
    await this.oracle.withTransaction(async (context) => {
      const access = await this.requireEditable(context, id, user);
      await this.repository.cancel(context, access, rowVersion, versionRowVersion, user.username);
    });
    await this.audit.recordRequired({
      actorUserId: user.userId,
      enterpriseUsername: user.username,
      actionCode: 'JSA_DRAFT_CANCELLED',
      targetType: 'JSA_MASTER',
      targetId: id,
      nextState: { status: 'CANCELLED' },
    });
    return { jsaId: id, status: 'CANCELLED' };
  }
  private async requireEditable(context: any, id: string, user: AuthenticatedUser) {
    const access = await this.repository.access(context, id, true);
    if (!access) throw new ResourceNotFoundError('Working JSA Draft was not found');
    this.requireScope(user, access, 'ACT');
    if (access.status !== 'DRAFT' || !['DRAFT', 'RETURNED'].includes(access.versionStatus))
      throw new StateConflictError('Only a Draft or Returned JSA may be edited');
    if (access.creatorUserId !== user.userId)
      throw new StateConflictError(
        'Draft takeover is not enabled; only the creator may edit this Draft',
      );
    return access;
  }
  private requireScope(
    user: AuthenticatedUser,
    target: { ownerSiteId?: string; siteId?: string; rigId: string; departmentId: string },
    access: 'VIEW' | 'ACT',
  ) {
    if (
      !this.scopes.allows(
        user,
        {
          scopeType: 'DEPARTMENT',
          siteId: target.ownerSiteId ?? target.siteId!,
          rigId: target.rigId,
          departmentId: target.departmentId,
        },
        access,
      )
    )
      throw new DataScopeDeniedError();
  }
  private assertIds(input: CreateDraftInput) {
    for (const [field, value] of Object.entries(input))
      if (field.endsWith('Id') && value && !/^\d{1,19}$/.test(value))
        throw new ValidationError(`${field} must be a decimal ID string`);
  }
}
