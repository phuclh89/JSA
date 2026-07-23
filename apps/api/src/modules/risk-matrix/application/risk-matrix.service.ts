import { Inject, Injectable } from '@nestjs/common';
import type {
  AuthenticatedUser,
  RiskMatrixSummary,
  RiskMatrixVersionDetail,
} from '@jsams/shared-types';
import {
  DataScopeDeniedError,
  DuplicateConflictError,
  MatrixIncompleteError,
  MultipleEffectiveMatricesError,
  NoEffectiveMatrixError,
  OptimisticLockError,
  OverlappingAssignmentError,
  ResourceNotFoundError,
  StateConflictError,
  ValidationError,
} from '../../../common/errors/application-errors';
import { assertOracleId } from '../../../common/oracle/oracle-id';
import { OracleService } from '../../../common/oracle/oracle.service';
import { DataScopeService } from '../../security/application/data-scope.service';
import { SecurityAuditService } from '../../security/application/security-audit.service';
import { validateMatrixConfiguration } from '../domain/matrix-completeness';
import {
  RISK_MATRIX_REPOSITORY,
  type RiskMatrixRepository,
} from '../domain/risk-matrix.repository';
import type {
  AssignmentInput,
  AxisInput,
  CellInput,
  MatrixConfigurationInput,
  MatrixInput,
  ResultInput,
  VersionInput,
} from '../domain/risk-matrix.types';

@Injectable()
export class RiskMatrixService {
  constructor(
    private readonly oracle: OracleService,
    @Inject(RISK_MATRIX_REPOSITORY) private readonly repository: RiskMatrixRepository,
    private readonly scopes: DataScopeService,
    private readonly audit: SecurityAuditService,
  ) {}

  listMatrices(keyword?: string, active?: boolean) {
    return this.oracle.withTransaction((context) =>
      this.repository.listMatrices(context, keyword, active),
    );
  }
  listVersionOptions(matrixId?: string) {
    return this.oracle.withTransaction((context) =>
      this.repository.listVersionOptions(context, matrixId),
    );
  }
  listAssignments(user: AuthenticatedUser, rigId?: string) {
    return this.oracle.withTransaction(async (context) => {
      const page = await this.repository.listAssignments(context, rigId);
      const items = page.items.filter((item) =>
        this.scopes.allows(
          user,
          { scopeType: 'RIG', siteId: item.siteId, rigId: item.rigId },
          'VIEW',
        ),
      );
      return { items, total: items.length };
    });
  }

  async matrix(id: string): Promise<RiskMatrixSummary> {
    return this.oracle.withTransaction(async (context) => {
      const item = await this.repository.findMatrix(context, id);
      if (!item) throw new ResourceNotFoundError('Risk Matrix was not found');
      return item;
    });
  }
  async version(id: string): Promise<RiskMatrixVersionDetail> {
    return this.oracle.withTransaction(async (context) => {
      const item = await this.repository.loadVersion(context, id);
      if (!item) throw new ResourceNotFoundError('Matrix Version was not found');
      return item;
    });
  }

  async createMatrix(input: MatrixInput, user: AuthenticatedUser) {
    this.validateMatrix(input);
    return this.write(async (context) => {
      const item = await this.repository.createMatrix(context, input, user.username);
      await this.audit.recordRequired({
        actorUserId: user.userId,
        enterpriseUsername: user.username,
        actionCode: 'RISK_MATRIX_CREATED',
        targetType: 'RISK_MATRIX',
        targetId: item.id,
        nextState: item,
      });
      return item;
    });
  }
  async updateMatrix(id: string, input: MatrixInput, user: AuthenticatedUser) {
    assertOracleId(id);
    this.validateMatrix(input);
    if (!input.rowVersion) throw new ValidationError('rowVersion is required');
    return this.write(async (context) => {
      const before = await this.repository.findMatrix(context, id);
      if (!before) throw new ResourceNotFoundError();
      if (before.versionCount > 0 && before.dimension !== input.dimension)
        throw new StateConflictError(
          'Matrix dimension cannot change after a Matrix Version exists',
        );
      const item = await this.repository.updateMatrix(context, id, input, user.username);
      if (!item) throw new OptimisticLockError();
      await this.audit.recordRequired({
        actorUserId: user.userId,
        enterpriseUsername: user.username,
        actionCode: 'RISK_MATRIX_UPDATED',
        targetType: 'RISK_MATRIX',
        targetId: id,
        previousState: before,
        nextState: item,
      });
      return item;
    });
  }
  async setMatrixActive(id: string, active: boolean, rowVersion: string, user: AuthenticatedUser) {
    return this.write(async (context) => {
      const before = await this.repository.findMatrix(context, id);
      if (!before) throw new ResourceNotFoundError();
      const item = await this.repository.setMatrixActive(
        context,
        id,
        active,
        rowVersion,
        user.username,
      );
      if (!item) throw new OptimisticLockError();
      await this.audit.recordRequired({
        actorUserId: user.userId,
        enterpriseUsername: user.username,
        actionCode: active ? 'RISK_MATRIX_ACTIVATED' : 'RISK_MATRIX_DEACTIVATED',
        targetType: 'RISK_MATRIX',
        targetId: id,
        previousState: before,
        nextState: item,
      });
      return item;
    });
  }

  async createVersion(matrixId: string, input: VersionInput, user: AuthenticatedUser) {
    this.validateVersion(input);
    return this.write(async (context) => {
      const matrix = await this.repository.findMatrix(context, matrixId);
      if (!matrix) throw new ResourceNotFoundError('Risk Matrix was not found');
      if (!matrix.active)
        throw new StateConflictError('An inactive Risk Matrix cannot receive a new version');
      const version = await this.repository.createVersion(context, matrixId, input, user.username);
      await this.audit.recordRequired({
        actorUserId: user.userId,
        enterpriseUsername: user.username,
        actionCode: 'MATRIX_VERSION_CREATED',
        targetType: 'RISK_MATRIX_VERSION',
        targetId: version.id,
        nextState: version,
      });
      return version;
    });
  }
  async updateVersion(id: string, input: VersionInput, user: AuthenticatedUser) {
    this.validateVersion(input);
    if (!input.rowVersion) throw new ValidationError('rowVersion is required');
    return this.write(async (context) => {
      const before = await this.repository.loadVersion(context, id);
      if (!before) throw new ResourceNotFoundError();
      if (before.immutable) throw new StateConflictError('An assigned Matrix Version is immutable');
      const updated = await this.repository.updateVersion(context, id, input, user.username);
      if (!updated) throw new OptimisticLockError();
      const after = (await this.repository.loadVersion(context, id))!;
      await this.audit.recordRequired({
        actorUserId: user.userId,
        enterpriseUsername: user.username,
        actionCode: 'MATRIX_VERSION_UPDATED',
        targetType: 'RISK_MATRIX_VERSION',
        targetId: id,
        previousState: before,
        nextState: after,
      });
      return after;
    });
  }

  async saveConfiguration(id: string, raw: unknown, user: AuthenticatedUser) {
    const input = this.normalizeConfiguration(raw);
    return this.write(async (context) => {
      const version = await this.repository.loadVersion(context, id);
      if (!version) throw new ResourceNotFoundError();
      if (version.immutable)
        throw new StateConflictError('An effective or historical Matrix Version is immutable');
      const validation = validateMatrixConfiguration(
        version.dimension,
        input.likelihoods,
        input.severities,
        input.results,
        input.cells,
      );
      const structural = [
        'LIKELIHOOD_CODE_DUPLICATE',
        'LIKELIHOOD_ORDER_DUPLICATE',
        'SEVERITY_CODE_DUPLICATE',
        'SEVERITY_ORDER_DUPLICATE',
        'RISK_RESULT_CODE_DUPLICATE',
        'MATRIX_CELL_DUPLICATE',
        'MATRIX_CELL_REFERENCE_INVALID',
        'RISK_RESULT_REFERENCE_INVALID',
        'MATRIX_CELL_RATING_MISSING',
      ];
      if (validation.errors.some((issue) => structural.includes(issue.code)))
        throw new ValidationError(
          'Matrix configuration contains invalid or duplicate references',
          validation.errors,
        );
      const saved = await this.repository.replaceConfiguration(context, id, input, user.username);
      if (!saved) throw new OptimisticLockError();
      const after = (await this.repository.loadVersion(context, id))!;
      await this.audit.recordRequired({
        actorUserId: user.userId,
        enterpriseUsername: user.username,
        actionCode: 'MATRIX_CONFIGURATION_SAVED',
        targetType: 'RISK_MATRIX_VERSION',
        targetId: id,
        previousState: { rowVersion: version.rowVersion },
        nextState: { rowVersion: after.rowVersion, completeness: after.completeness },
      });
      return after;
    });
  }
  async validateVersionCompleteness(id: string) {
    const version = await this.version(id);
    if (!version.completeness.complete)
      await this.audit.recordRequired({
        actionCode: 'MATRIX_COMPLETENESS_FAILED',
        targetType: 'RISK_MATRIX_VERSION',
        targetId: id,
        nextState: version.completeness,
      });
    return version.completeness;
  }

  async createAssignment(input: AssignmentInput, user: AuthenticatedUser) {
    this.validateAssignment(input);
    return this.write(async (context) => {
      const rig = await this.requireWritableRig(context, input.rigId, user);
      const version = await this.repository.loadVersion(context, input.matrixVersionId);
      if (!version) throw new ResourceNotFoundError('Matrix Version was not found');
      const matrix = await this.repository.findMatrix(context, version.matrixId);
      if (!matrix?.active || !version.active || !version.completeness.complete)
        throw new MatrixIncompleteError(version.completeness.errors);
      const overlap = await this.repository.hasOverlap(context, input);
      if (overlap)
        throw new OverlappingAssignmentError([
          {
            assignmentId: overlap.id,
            effectiveFrom: overlap.effectiveFrom,
            effectiveTo: overlap.effectiveTo,
          },
        ]);
      const created = await this.repository.createAssignment(context, input, user.username);
      await this.audit.recordRequired({
        actorUserId: user.userId,
        enterpriseUsername: user.username,
        actionCode: 'RIG_MATRIX_ASSIGNED',
        targetType: 'RIG_MATRIX_ASSIGNMENT',
        targetId: created.id,
        siteId: rig.siteId,
        rigId: rig.rigId,
        nextState: created,
        comment: input.reason,
      });
      return created;
    });
  }
  async updateAssignment(id: string, input: AssignmentInput, user: AuthenticatedUser) {
    assertOracleId(id);
    this.validateAssignment(input);
    if (!input.rowVersion) throw new ValidationError('rowVersion is required');
    return this.write(async (context) => {
      const before = await this.repository.findAssignment(context, id);
      if (!before) throw new ResourceNotFoundError();
      if (before.rigId !== input.rigId)
        throw new StateConflictError('The Rig on an assignment cannot be changed');
      await this.requireWritableRig(context, input.rigId, user);
      const version = await this.repository.loadVersion(context, input.matrixVersionId);
      if (!version) throw new ResourceNotFoundError('Matrix Version was not found');
      const matrix = await this.repository.findMatrix(context, version.matrixId);
      if (!matrix?.active || !version.active || !version.completeness.complete)
        throw new MatrixIncompleteError(version.completeness.errors);
      const overlap = await this.repository.hasOverlap(context, input, id);
      if (overlap)
        throw new OverlappingAssignmentError([
          {
            assignmentId: overlap.id,
            effectiveFrom: overlap.effectiveFrom,
            effectiveTo: overlap.effectiveTo,
          },
        ]);
      const updated = await this.repository.updateAssignment(context, id, input, user.username);
      if (!updated)
        throw new StateConflictError(
          'Only a future assignment with the current row version may be edited',
        );
      await this.audit.recordRequired({
        actorUserId: user.userId,
        enterpriseUsername: user.username,
        actionCode: 'RIG_MATRIX_ASSIGNMENT_UPDATED',
        targetType: 'RIG_MATRIX_ASSIGNMENT',
        targetId: id,
        rigId: updated.rigId,
        previousState: before,
        nextState: updated,
        comment: input.reason,
      });
      return updated;
    });
  }
  async endAssignment(
    id: string,
    effectiveTo: string,
    reason: string,
    rowVersion: string,
    user: AuthenticatedUser,
  ) {
    if (!reason.trim() || Number.isNaN(Date.parse(effectiveTo)))
      throw new ValidationError('A valid end time and reason are required');
    return this.write(async (context) => {
      const before = await this.repository.findAssignment(context, id);
      if (!before) throw new ResourceNotFoundError();
      if (Date.parse(effectiveTo) <= Date.parse(before.effectiveFrom))
        throw new ValidationError('The assignment end time must be later than its start time');
      await this.requireWritableRig(context, before.rigId, user);
      const updated = await this.repository.endAssignment(
        context,
        id,
        effectiveTo,
        reason,
        rowVersion,
        user.username,
      );
      if (!updated) throw new OptimisticLockError();
      await this.audit.recordRequired({
        actorUserId: user.userId,
        enterpriseUsername: user.username,
        actionCode: 'RIG_MATRIX_ASSIGNMENT_ENDED',
        targetType: 'RIG_MATRIX_ASSIGNMENT',
        targetId: id,
        rigId: updated.rigId,
        previousState: before,
        nextState: updated,
        comment: reason,
      });
      return updated;
    });
  }
  async resolveEffectiveMatrixVersion(
    rigId: string,
    effectiveAt: string,
    user: AuthenticatedUser,
  ): Promise<RiskMatrixVersionDetail> {
    if (Number.isNaN(Date.parse(effectiveAt)))
      throw new ValidationError('effectiveAt must be a valid date');
    return this.oracle.withTransaction(async (context) => {
      const rig = await this.repository.lockRig(context, rigId);
      if (!rig) throw new ResourceNotFoundError('Rig was not found');
      if (!rig.active) throw new StateConflictError('The Rig is inactive');
      if (!this.scopes.allows(user, { scopeType: 'RIG', siteId: rig.siteId, rigId }, 'VIEW'))
        throw new DataScopeDeniedError();
      const assignments = await this.repository.resolveEffective(context, rigId, effectiveAt);
      if (assignments.length === 0) throw new NoEffectiveMatrixError();
      if (assignments.length > 1) throw new MultipleEffectiveMatricesError();
      const assignment = assignments[0]!;
      const version = await this.repository.loadVersion(context, assignment.matrixVersionId);
      if (!version?.completeness.complete)
        throw new MatrixIncompleteError(version?.completeness.errors);
      return version;
    });
  }

  private async requireWritableRig(
    context: Parameters<RiskMatrixRepository['lockRig']>[0],
    rigId: string,
    user: AuthenticatedUser,
  ) {
    const rig = await this.repository.lockRig(context, rigId);
    if (!rig) throw new ResourceNotFoundError('Rig was not found');
    if (!rig.active) throw new StateConflictError('The Rig is inactive');
    if (
      !this.scopes.allows(user, { scopeType: 'RIG', siteId: rig.siteId, rigId: rig.rigId }, 'ACT')
    )
      throw new DataScopeDeniedError();
    return rig;
  }
  private validateMatrix(input: MatrixInput) {
    if (!input.code.trim() || !input.name.trim() || ![3, 5].includes(input.dimension))
      throw new ValidationError('Matrix code, name, and a 3 or 5 dimension are required');
  }
  private validateVersion(input: VersionInput) {
    if (!input.versionCode.trim()) throw new ValidationError('Version code is required');
    if (input.effectiveFrom && Number.isNaN(Date.parse(input.effectiveFrom)))
      throw new ValidationError('effectiveFrom is invalid');
    if (input.effectiveTo && Number.isNaN(Date.parse(input.effectiveTo)))
      throw new ValidationError('effectiveTo is invalid');
    if (
      input.effectiveFrom &&
      input.effectiveTo &&
      Date.parse(input.effectiveTo) < Date.parse(input.effectiveFrom)
    )
      throw new ValidationError('effectiveTo must not precede effectiveFrom');
  }
  private validateAssignment(input: AssignmentInput) {
    assertOracleId(input.rigId, 'rigId');
    assertOracleId(input.matrixVersionId, 'matrixVersionId');
    if (
      !input.reason.trim() ||
      Number.isNaN(Date.parse(input.effectiveFrom)) ||
      (input.effectiveTo && Number.isNaN(Date.parse(input.effectiveTo)))
    )
      throw new ValidationError('Valid effective dates and a reason are required');
    if (input.effectiveTo && Date.parse(input.effectiveTo) <= Date.parse(input.effectiveFrom))
      throw new ValidationError('effectiveTo must be later than effectiveFrom');
  }

  private normalizeConfiguration(raw: unknown): MatrixConfigurationInput {
    const value = raw as Partial<MatrixConfigurationInput>;
    if (
      !value ||
      typeof value !== 'object' ||
      typeof value.rowVersion !== 'string' ||
      !Array.isArray(value.likelihoods) ||
      !Array.isArray(value.severities) ||
      !Array.isArray(value.results) ||
      !Array.isArray(value.cells)
    )
      throw new ValidationError('A complete Matrix configuration payload is required');
    assertOracleId(value.rowVersion, 'rowVersion');
    const axis = (item: unknown): AxisInput => {
      const x = item as AxisInput;
      if (
        !x ||
        typeof x.ref !== 'string' ||
        typeof x.code !== 'string' ||
        typeof x.label !== 'string' ||
        typeof x.displayOrder !== 'number' ||
        typeof x.definition !== 'string' ||
        (x.numericValue !== null && typeof x.numericValue !== 'number')
      )
        throw new ValidationError('Matrix axis values are invalid');
      return x;
    };
    const result = (item: unknown): ResultInput => {
      const x = item as ResultInput;
      if (
        !x ||
        typeof x.ref !== 'string' ||
        typeof x.code !== 'string' ||
        typeof x.name !== 'string' ||
        typeof x.displayOrder !== 'number'
      )
        throw new ValidationError('Risk Result values are invalid');
      return x;
    };
    const cell = (item: unknown): CellInput => {
      const x = item as CellInput;
      if (
        !x ||
        typeof x.ref !== 'string' ||
        typeof x.likelihoodRef !== 'string' ||
        typeof x.severityRef !== 'string' ||
        typeof x.riskResultRef !== 'string' ||
        (x.ratingCode !== null && typeof x.ratingCode !== 'string') ||
        (x.ratingValue !== null && typeof x.ratingValue !== 'number')
      )
        throw new ValidationError('Matrix Cell values are invalid');
      return x;
    };
    return {
      rowVersion: value.rowVersion,
      likelihoods: value.likelihoods.map(axis),
      severities: value.severities.map(axis),
      results: value.results.map(result),
      cells: value.cells.map(cell),
    };
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
