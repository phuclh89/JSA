import { Inject, Injectable } from '@nestjs/common';
import type {
  AuthenticatedUser,
  MasterDataKind,
  MasterDataRecord,
  PaginatedResponse,
} from '@jsams/shared-types';
import {
  DataScopeDeniedError,
  DuplicateConflictError,
  OptimisticLockError,
  ResourceNotFoundError,
  ValidationError,
} from '../../../common/errors/application-errors';
import { assertOracleId } from '../../../common/oracle/oracle-id';
import { OracleService } from '../../../common/oracle/oracle.service';
import { DataScopeService } from '../../security/application/data-scope.service';
import { SecurityAuditService } from '../../security/application/security-audit.service';
import {
  MASTER_DATA_REPOSITORY,
  type MasterDataRepository,
} from '../domain/master-data.repository';
import {
  MASTER_DATA_KINDS,
  type MasterDataInput,
  type MasterDataListQuery,
  type MasterDataMutation,
} from '../domain/master-data.types';
import { validateSystemParameter } from '../domain/system-parameter-validation';

@Injectable()
export class MasterDataService {
  constructor(
    private readonly oracle: OracleService,
    @Inject(MASTER_DATA_REPOSITORY) private readonly repository: MasterDataRepository,
    private readonly scopes: DataScopeService,
    private readonly audit: SecurityAuditService,
  ) {}

  assertKind(value: string): MasterDataKind {
    if (!MASTER_DATA_KINDS.includes(value as MasterDataKind))
      throw new ResourceNotFoundError('Master-data catalogue was not found');
    return value as MasterDataKind;
  }

  async scopeOptions(
    type: 'SITE' | 'RIG' | 'DEPARTMENT',
    siteId: string | undefined,
    rigId: string | undefined,
    user: AuthenticatedUser,
  ) {
    if (!['SITE', 'RIG', 'DEPARTMENT'].includes(type))
      throw new ValidationError('Scope option type is invalid');
    return this.oracle.withTransaction(async (context) => {
      const items = await this.repository.listScopeOptions(context, type, siteId, rigId);
      return items.filter((item) =>
        type === 'SITE'
          ? user.dataScopes.some((scope) => scope.siteId === item.id && scope.canView)
          : user.dataScopes.some(
              (scope) =>
                scope.siteId === item.siteId &&
                scope.canView &&
                (type === 'RIG'
                  ? scope.scopeType === 'SITE' || scope.rigId === item.id
                  : scope.scopeType === 'SITE' ||
                    (scope.scopeType === 'RIG' && (!item.rigId || scope.rigId === item.rigId)) ||
                    scope.departmentId === item.id),
            ),
      );
    });
  }

  async list(
    kind: MasterDataKind,
    query: MasterDataListQuery,
    user: AuthenticatedUser,
  ): Promise<PaginatedResponse<MasterDataRecord>> {
    return this.oracle.withTransaction(async (context) => {
      const page = await this.repository.list(context, kind, query);
      const items = page.items.filter((item) => this.canAccess(user, item, 'VIEW'));
      return {
        ...page,
        items,
        total: items.length === page.items.length ? page.total : items.length,
      };
    });
  }

  async selection(
    kind: MasterDataKind,
    query: Omit<MasterDataListQuery, 'active'>,
    user: AuthenticatedUser,
  ): Promise<MasterDataRecord[]> {
    const { siteId, rigId, departmentId, ...pageQuery } = query;
    const page = await this.list(
      kind,
      { ...pageQuery, active: true, pageSize: Math.min(query.pageSize, 100) },
      user,
    );
    return page.items.filter((item) => {
      if (item.scopeType === 'GLOBAL') return true;
      if (!siteId || item.siteId !== siteId) return false;
      if (item.scopeType === 'SITE') return true;
      if (!rigId || item.rigId !== rigId) return false;
      if (item.scopeType === 'RIG') return true;
      return Boolean(departmentId && item.departmentId === departmentId);
    });
  }

  async detail(
    kind: MasterDataKind,
    id: string,
    user: AuthenticatedUser,
  ): Promise<MasterDataRecord> {
    assertOracleId(id);
    return this.oracle.withTransaction(async (context) => {
      const record = await this.repository.findById(context, kind, id);
      if (!record) throw new ResourceNotFoundError();
      if (!this.canAccess(user, record, 'VIEW')) throw new DataScopeDeniedError();
      return record;
    });
  }

  async create(
    kind: MasterDataKind,
    input: MasterDataInput,
    user: AuthenticatedUser,
  ): Promise<MasterDataRecord> {
    this.validateInput(kind, input);
    return this.write(async (context) => {
      await this.validateWriteContext(context, kind, input, user);
      const created = await this.repository.create(context, kind, input, user.username);
      await this.audit.recordRequired({
        actorUserId: user.userId,
        enterpriseUsername: user.username,
        actionCode: 'MASTER_DATA_CREATED',
        targetType: kind,
        targetId: created.id,
        siteId: created.siteId,
        rigId: created.rigId,
        nextState: created,
      });
      return created;
    });
  }

  async update(
    kind: MasterDataKind,
    id: string,
    input: MasterDataMutation,
    user: AuthenticatedUser,
  ): Promise<MasterDataRecord> {
    assertOracleId(id);
    this.validateInput(kind, input);
    if (!input.rowVersion) throw new ValidationError('rowVersion is required');
    return this.write(async (context) => {
      const before = await this.repository.findById(context, kind, id);
      if (!before) throw new ResourceNotFoundError();
      if (!this.canAccess(user, before, 'ACT')) throw new DataScopeDeniedError();
      await this.validateWriteContext(context, kind, input, user);
      const updated = await this.repository.update(
        context,
        kind,
        id,
        input,
        input.rowVersion!,
        user.username,
      );
      if (!updated) throw new OptimisticLockError();
      await this.audit.recordRequired({
        actorUserId: user.userId,
        enterpriseUsername: user.username,
        actionCode: 'MASTER_DATA_UPDATED',
        targetType: kind,
        targetId: id,
        siteId: updated.siteId,
        rigId: updated.rigId,
        previousState: before,
        nextState: updated,
      });
      return updated;
    });
  }

  async setActive(
    kind: MasterDataKind,
    id: string,
    active: boolean,
    rowVersion: string,
    user: AuthenticatedUser,
  ): Promise<MasterDataRecord> {
    assertOracleId(id);
    assertOracleId(rowVersion, 'rowVersion');
    return this.write(async (context) => {
      const before = await this.repository.findById(context, kind, id);
      if (!before) throw new ResourceNotFoundError();
      if (!this.canAccess(user, before, 'ACT')) throw new DataScopeDeniedError();
      const updated = await this.repository.setActive(
        context,
        kind,
        id,
        active,
        rowVersion,
        user.username,
      );
      if (!updated) throw new OptimisticLockError();
      await this.audit.recordRequired({
        actorUserId: user.userId,
        enterpriseUsername: user.username,
        actionCode: active ? 'MASTER_DATA_REACTIVATED' : 'MASTER_DATA_DEACTIVATED',
        targetType: kind,
        targetId: id,
        siteId: updated.siteId,
        rigId: updated.rigId,
        previousState: before,
        nextState: updated,
      });
      return updated;
    });
  }

  private async validateWriteContext(
    context: Parameters<MasterDataRepository['create']>[0],
    kind: MasterDataKind,
    input: MasterDataInput,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (!(await this.repository.validateScope(context, input)))
      throw new ValidationError('The selected scope hierarchy is invalid or inactive');
    if (!this.canAccess(user, input, 'ACT')) throw new DataScopeDeniedError();
    if (kind === 'tools') {
      const categoryId = input.attributes.toolCategoryId;
      if (
        typeof categoryId !== 'string' ||
        !(await this.repository.isToolCategoryActive(context, categoryId))
      )
        throw new ValidationError('An active Tool Category is required');
    }
  }

  private validateInput(kind: MasterDataKind, input: MasterDataInput): void {
    if (!input.code.trim() || !input.name.trim())
      throw new ValidationError('Code and name are required');
    if (input.scopeType === 'GLOBAL' && (input.siteId || input.rigId || input.departmentId))
      throw new ValidationError('Global scope cannot include site, rig, or department');
    if (input.scopeType !== 'GLOBAL' && !input.siteId)
      throw new ValidationError('A site is required for scoped data');
    if (input.scopeType === 'RIG' && !input.rigId)
      throw new ValidationError('A rig is required for rig scope');
    if (input.scopeType === 'DEPARTMENT' && !input.departmentId)
      throw new ValidationError('A department is required for department scope');
    if (
      ['hazard-prompts', 'procedure-references', 'system-parameters'].includes(kind) &&
      input.scopeType === 'DEPARTMENT'
    )
      throw new ValidationError('Department scope is not supported for this catalogue');
    if (kind === 'system-parameters')
      validateSystemParameter(input.code, input.attributes.valueType, input.attributes.value);
  }

  private canAccess(
    user: AuthenticatedUser,
    scope: Pick<MasterDataInput, 'scopeType' | 'siteId' | 'rigId' | 'departmentId'>,
    access: 'VIEW' | 'ACT',
  ): boolean {
    if (scope.scopeType === 'GLOBAL') return true;
    if (!scope.siteId) return false;
    return this.scopes.allows(
      user,
      {
        scopeType: scope.scopeType === 'DEPARTMENT' ? 'DEPARTMENT' : scope.scopeType,
        siteId: scope.siteId,
        ...(scope.rigId ? { rigId: scope.rigId } : {}),
        ...(scope.departmentId ? { departmentId: scope.departmentId } : {}),
      },
      access,
    );
  }

  private async write<T>(handler: Parameters<OracleService['withTransaction']>[0]): Promise<T> {
    try {
      return (await this.oracle.withTransaction(handler)) as T;
    } catch (error) {
      if ((error as { errorNum?: number }).errorNum === 1) throw new DuplicateConflictError();
      throw error;
    }
  }
}
