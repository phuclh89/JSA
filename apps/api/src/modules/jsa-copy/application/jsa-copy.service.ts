import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AuthenticatedUser,
  JsaCopyIssue,
  JsaCopyPreflight,
  JsaCopyReferenceMapping,
} from '@jsams/shared-types';
import {
  ResourceNotFoundError,
  StateConflictError,
  ValidationError,
} from '../../../common/errors/application-errors';
import { correlationContext } from '../../../common/interceptors/correlation-context';
import { OracleService } from '../../../common/oracle/oracle.service';
import { JsaNumberService } from '../../jsa-draft/application/jsa-number.service';
import { DataScopeService } from '../../security/application/data-scope.service';
import { SecurityAuditService } from '../../security/application/security-audit.service';
import { JSA_COPY_REPOSITORY, type JsaCopyRepository } from '../domain/jsa-copy.repository';
import type {
  CopyAggregate,
  CopyExecutionPlan,
  CopyReferenceCandidate,
  CopySourceRecord,
} from '../domain/jsa-copy.types';
import { JsaCopyCapabilityService } from './jsa-copy-capability.service';

interface DestinationInput {
  destinationSiteId: string;
  destinationRigId: string;
  destinationDepartmentId: string;
}

@Injectable()
export class JsaCopyService {
  constructor(
    private readonly oracle: OracleService,
    @Inject(JSA_COPY_REPOSITORY) private readonly repository: JsaCopyRepository,
    private readonly capabilities: JsaCopyCapabilityService,
    private readonly scopes: DataScopeService,
    private readonly numbers: JsaNumberService,
    private readonly config: ConfigService,
    private readonly audit: SecurityAuditService,
  ) {}

  capabilityState(user: AuthenticatedUser) {
    return this.capabilities.state(user);
  }

  async destinationOptions(jsaId: string, user: AuthenticatedUser) {
    await this.requireCopyCapabilities(jsaId, user);
    const localSiteId = this.localSiteId();
    return this.oracle.withTransaction(async (context) => {
      const source = await this.repository.source(context, jsaId);
      if (!source) throw new ResourceNotFoundError('Source JSA was not found');
      this.requireSourceScope(source, user);
      const options = await this.repository.destinationOptions(context, localSiteId);
      if (!options)
        throw new StateConflictError('The local authoritative Site is inactive or unavailable');
      const rigs = options.rigs.filter(
        (rig) =>
          rig.id !== source.rigId &&
          user.dataScopes.some(
            (scope) =>
              scope.siteId === rig.siteId &&
              scope.canAct &&
              (scope.scopeType === 'SITE' || scope.rigId === rig.id),
          ),
      );
      const rigIds = new Set(rigs.map((rig) => rig.id));
      const departments = options.departments.filter(
        (department) =>
          rigIds.has(department.rigId) &&
          this.scopes.allows(
            user,
            {
              scopeType: 'DEPARTMENT',
              siteId: department.siteId,
              rigId: department.rigId,
              departmentId: department.id,
            },
            'ACT',
          ),
      );
      return { ...options, rigs, departments };
    });
  }

  async preflight(jsaId: string, input: DestinationInput, user: AuthenticatedUser) {
    await this.requireCopyCapabilities(jsaId, user);
    this.assertInput(input);
    let preflight: JsaCopyPreflight;
    try {
      ({ preflight } = await this.oracle.withTransaction((context) =>
        this.evaluate(context, jsaId, input, user, false),
      ));
    } catch (error) {
      if (error instanceof ResourceNotFoundError)
        await this.audit.recordRequired({
          actorUserId: user.userId,
          enterpriseUsername: user.username,
          actionCode: 'JSA_COPY_SOURCE_DENIED_OR_NOT_FOUND',
          targetType: 'JSA_MASTER',
          targetId: jsaId,
          nextState: { correlationId: this.correlationId() },
        });
      throw error;
    }
    if (!preflight.canCopy)
      await this.audit.recordRequired({
        actorUserId: user.userId,
        enterpriseUsername: user.username,
        actionCode: 'JSA_COPY_PREFLIGHT_BLOCKED',
        targetType: 'JSA_MASTER',
        targetId: jsaId,
        siteId: input.destinationSiteId,
        rigId: input.destinationRigId,
        nextState: {
          blockerCodes: preflight.blockers.map((blocker) => blocker.code),
          correlationId: this.correlationId(),
        },
      });
    return preflight;
  }

  async copy(
    jsaId: string,
    input: DestinationInput & { copyReason: string; acknowledgeWarnings: boolean },
    requestKey: string | undefined,
    user: AuthenticatedUser,
  ) {
    await this.requireCopyCapabilities(jsaId, user);
    this.assertInput(input);
    const reason = input.copyReason?.trim();
    if (!reason) throw new ValidationError('Copy reason is required');
    if (reason.length > 1000)
      throw new ValidationError('Copy reason must not exceed 1000 characters');
    const key = requestKey?.trim();
    if (!key || key.length > 128)
      throw new ValidationError('Idempotency-Key is required and must not exceed 128 characters');
    const requestHash = this.hash(jsaId, input, reason);

    const replay = await this.oracle.withTransaction((context) =>
      this.repository.existingRequest(context, user.userId, key),
    );
    if (replay) {
      if (replay.requestHash !== requestHash)
        throw new StateConflictError(
          'Idempotency-Key was already used with a different copy request',
        );
      await this.audit.recordRequired({
        actorUserId: user.userId,
        enterpriseUsername: user.username,
        actionCode: 'JSA_COPY_IDEMPOTENT_RETRY',
        targetType: 'JSA_MASTER',
        targetId: replay.result.destinationJsaId,
        nextState: { sourceJsaId: jsaId },
      });
      return replay.result;
    }

    await this.audit.recordRequired({
      actorUserId: user.userId,
      enterpriseUsername: user.username,
      actionCode: 'JSA_COPY_STARTED',
      targetType: 'JSA_MASTER',
      targetId: jsaId,
      siteId: input.destinationSiteId,
      rigId: input.destinationRigId,
      nextState: { reason, correlationId: this.correlationId() },
    });
    try {
      const result = await this.oracle.withTransaction(async (context) => {
        const evaluated = await this.evaluate(context, jsaId, input, user, true);
        if (!evaluated.preflight.canCopy)
          throw new ValidationError(
            'Cross-Rig Copy preflight is blocked',
            evaluated.preflight.blockers,
          );
        if (evaluated.preflight.warnings.length > 0 && !input.acknowledgeWarnings)
          throw new ValidationError(
            'Copy warnings must be acknowledged before confirmation',
            evaluated.preflight.warnings,
          );
        const number = await this.numbers.next(context, input.destinationSiteId);
        return this.repository.createCopy(
          context,
          evaluated.plan!,
          number,
          { requestKey: key, requestHash, reason },
          {
            userId: user.userId,
            username: user.username,
            displayName: user.displayName,
          },
        );
      });
      await this.audit.recordRequired({
        actorUserId: user.userId,
        enterpriseUsername: user.username,
        actionCode: 'JSA_COPY_COMPLETED',
        targetType: 'JSA_MASTER',
        targetId: result.destinationJsaId,
        siteId: result.destination.siteId,
        rigId: result.destination.rigId,
        nextState: {
          sourceJsaId: result.sourceJsaId,
          sourceVersionId: result.sourceVersionId,
          destinationVersionId: result.destinationWorkingVersionId,
          riskCopyMode: result.riskCopyMode,
          sourceMatrixVersionId: result.sourceMatrix.id,
          destinationMatrixVersionId: result.destinationMatrix.id,
          excludedAttachmentCount: result.excludedAttachmentCount,
          reason,
        },
      });
      return result;
    } catch (error) {
      if ((error as { errorNum?: number }).errorNum === 1) {
        const concurrent = await this.oracle.withTransaction((context) =>
          this.repository.existingRequest(context, user.userId, key),
        );
        if (concurrent) {
          if (concurrent.requestHash !== requestHash)
            throw new StateConflictError(
              'Idempotency-Key was already used with a different copy request',
            );
          return concurrent.result;
        }
      }
      await this.audit.recordRequired({
        actorUserId: user.userId,
        enterpriseUsername: user.username,
        actionCode: 'JSA_COPY_FAILED',
        targetType: 'JSA_MASTER',
        targetId: jsaId,
        siteId: input.destinationSiteId,
        rigId: input.destinationRigId,
        nextState: {
          errorCode: (error as { code?: string }).code ?? 'COPY_FAILED',
          correlationId: this.correlationId(),
        },
      });
      throw error;
    }
  }

  async provenance(jsaId: string, user: AuthenticatedUser) {
    this.capabilities.requireView(user);
    return this.oracle.withTransaction(async (context) => {
      const destination = await this.repository.source(context, jsaId);
      if (!destination) throw new ResourceNotFoundError('Destination JSA was not found');
      if (
        !this.scopes.allows(
          user,
          {
            scopeType: 'DEPARTMENT',
            siteId: destination.siteId,
            rigId: destination.rigId,
            departmentId: destination.departmentId,
          },
          'VIEW',
        )
      )
        throw new ResourceNotFoundError('Destination JSA was not found');
      const provenance = await this.repository.provenance(context, jsaId);
      return provenance ?? null;
    });
  }

  private async evaluate(
    context: any,
    jsaId: string,
    input: DestinationInput,
    user: AuthenticatedUser,
    lock: boolean,
  ): Promise<{ preflight: JsaCopyPreflight; plan?: CopyExecutionPlan }> {
    const source = await this.repository.source(context, jsaId, lock);
    if (!source) throw new ResourceNotFoundError('Source JSA was not found');
    this.requireSourceScope(source, user);
    const blockers: JsaCopyIssue[] = [];
    const warnings: JsaCopyIssue[] = [];
    if (!source.currentVersionId)
      blockers.push(this.issue('SOURCE_CURRENT_MISSING', 'Source has no Current Version'));
    if (source.lifecycleStatus !== 'PUBLISHED')
      blockers.push(
        this.issue('SOURCE_MASTER_NOT_ELIGIBLE', 'Source JSA is not operationally Published'),
      );
    if (source.versionStatus !== 'PUBLISHED')
      blockers.push(this.issue('SOURCE_NOT_PUBLISHED', 'Source Current Version is not Published'));
    if (!source.matrix)
      blockers.push(this.issue('SOURCE_MATRIX_MISSING', 'Source Matrix Version is unavailable'));

    const resolution = await this.repository.destinationResolution(
      context,
      input.destinationSiteId,
      input.destinationRigId,
      input.destinationDepartmentId,
    );
    if (!resolution.destination)
      blockers.push(
        this.issue(
          'DESTINATION_HIERARCHY_INVALID',
          'Destination Site, Rig, and Department must be active and compatible',
        ),
      );
    if (input.destinationSiteId !== this.localSiteId())
      blockers.push(
        this.issue(
          'DESTINATION_SITE_NOT_LOCAL',
          'Destination Site is not owned by this deployment',
        ),
      );
    if (input.destinationRigId === source.rigId)
      blockers.push(
        this.issue('DESTINATION_RIG_SAME_AS_SOURCE', 'Destination Rig must differ from source Rig'),
      );
    if (
      resolution.destination &&
      !this.scopes.allows(
        user,
        {
          scopeType: 'DEPARTMENT',
          siteId: resolution.destination.siteId,
          rigId: resolution.destination.rigId,
          departmentId: resolution.destination.departmentId,
        },
        'ACT',
      )
    )
      blockers.push(
        this.issue('DESTINATION_ACT_SCOPE_DENIED', 'Destination is outside the actor action scope'),
      );
    if (!resolution.matrix)
      blockers.push(
        this.issue('DESTINATION_MATRIX_MISSING', 'Destination has no effective Matrix Version'),
      );
    else if (!resolution.matrixComplete)
      blockers.push(
        this.issue(
          'DESTINATION_MATRIX_INCOMPLETE',
          'Destination effective Matrix Version is incomplete',
        ),
      );
    if (resolution.englishCount !== 1 || !resolution.languageId)
      blockers.push(
        this.issue(
          resolution.englishCount > 1 ? 'ENGLISH_AMBIGUOUS' : 'ENGLISH_MISSING',
          'Exactly one active English language must be configured',
        ),
      );

    const aggregate = source.versionId
      ? await this.repository.aggregate(context, source.versionId, source.matrix?.id)
      : this.emptyAggregate();
    this.validateStructure(aggregate, blockers);
    const promptMappings = this.mapReferences(aggregate.prompts, resolution.promptCandidates);
    const performerMappings = this.mapReferences(
      aggregate.performers,
      resolution.positionCandidates,
    );
    const supervisorMappings = this.mapReferences(
      aggregate.supervisors,
      resolution.positionCandidates,
    );
    const toolMappings = this.mapReferences(aggregate.tools, resolution.toolCandidates);
    this.mappingIssues(promptMappings, 'PROMPT', false, blockers, warnings);
    this.mappingIssues(performerMappings, 'PERFORMER_POSITION', true, blockers, warnings);
    this.mappingIssues(supervisorMappings, 'SUPERVISOR_POSITION', true, blockers, warnings);
    const requiredToolCodes = new Set(
      aggregate.tools.filter((tool) => !tool.noToolRequired).map((tool) => tool.code.toUpperCase()),
    );
    this.mappingIssues(
      toolMappings.filter((mapping) => requiredToolCodes.has(mapping.sourceCode.toUpperCase())),
      'TOOL',
      true,
      blockers,
      warnings,
    );
    if (aggregate.attachmentNames.length)
      warnings.push(
        this.issue(
          'ATTACHMENTS_NOT_COPIED',
          `${aggregate.attachmentNames.length} source attachment association(s) will not be copied`,
          { count: aggregate.attachmentNames.length },
        ),
      );
    const matricesSame = Boolean(
      source.matrix && resolution.matrix && source.matrix.id === resolution.matrix.id,
    );
    if (!matricesSame && source.matrix && resolution.matrix)
      warnings.push(
        this.issue(
          'MATRIX_DIFFERS_RISK_CLEARED',
          'Destination Matrix differs; every Initial and Residual Risk value will be cleared',
        ),
      );
    if (
      aggregate.legacyHeaderPresent ||
      aggregate.promptCoverageCount ||
      aggregate.procedureReferenceCount
    )
      warnings.push(
        this.issue(
          'LEGACY_CONTENT_NOT_COPIED',
          'Removed legacy fields, Prompt Coverage, and Procedure References will not be copied',
        ),
      );
    if (matricesSame && aggregate.invalidRiskReferenceCount)
      blockers.push(
        this.issue(
          'SOURCE_RISK_INVALID',
          'Source risk references do not belong completely to the source Matrix Version',
          { count: aggregate.invalidRiskReferenceCount },
        ),
      );
    const counts = {
      prompts: aggregate.prompts.length,
      tasks: aggregate.tasks.length,
      hazards: aggregate.hazards.length,
      controls: aggregate.controls.length,
      basicSteps: aggregate.steps.length,
      performers: aggregate.performers.length,
      supervisors: aggregate.supervisors.length,
      tools: aggregate.tools.filter((tool) => !tool.noToolRequired).length,
    };
    const preflight: JsaCopyPreflight = {
      source,
      ...(resolution.destination
        ? { destination: resolution.destination }
        : {
            destination: {
              siteId: input.destinationSiteId,
              siteCode: '',
              siteName: '',
              rigId: input.destinationRigId,
              rigCode: '',
              rigName: '',
              departmentId: input.destinationDepartmentId,
              departmentCode: '',
              departmentName: '',
            },
          }),
      ...(source.matrix ? { sourceMatrix: source.matrix } : {}),
      ...(resolution.matrix ? { destinationMatrix: resolution.matrix } : {}),
      riskCopyMode: matricesSame ? 'PRESERVED' : 'CLEARED',
      matrixReassessmentRequired: !matricesSame,
      counts,
      promptMappings,
      performerMappings,
      supervisorMappings,
      toolMappings,
      excludedAttachments: {
        count: aggregate.attachmentNames.length,
        names: aggregate.attachmentNames,
      },
      intentionallyNotCopied: [
        'Official and Temporary JSA numbers',
        'Publication and workflow history',
        'Favorites and notifications',
        'Checkout and Base-Version lineage',
        'Attachment associations, storage keys, and file binaries',
        'Prompt Coverage and Procedure References',
        'Removed legacy General Information fields',
      ],
      blockers,
      warnings,
      canCopy: blockers.length === 0,
    };
    const plan =
      preflight.canCopy &&
      source.matrix &&
      resolution.destination &&
      resolution.matrix &&
      resolution.languageId
        ? {
            source,
            destination: resolution.destination,
            sourceMatrix: source.matrix,
            destinationMatrix: resolution.matrix,
            languageId: resolution.languageId,
            aggregate,
            mappings: {
              prompts: promptMappings,
              performers: performerMappings,
              supervisors: supervisorMappings,
              tools: toolMappings,
            },
            riskCopyMode: preflight.riskCopyMode,
          }
        : undefined;
    return { preflight, ...(plan ? { plan } : {}) };
  }

  private mapReferences(
    rows: Array<{ code: string; name: string }>,
    candidates: CopyReferenceCandidate[],
  ): JsaCopyReferenceMapping[] {
    const grouped = new Map<string, { code: string; name: string; count: number }>();
    for (const row of rows) {
      const key = row.code.toUpperCase();
      const current = grouped.get(key);
      if (current) current.count += 1;
      else grouped.set(key, { code: row.code, name: row.name, count: 1 });
    }
    return [...grouped.values()].map((source) => {
      const matches = candidates.filter(
        (candidate) => candidate.code.toUpperCase() === source.code.toUpperCase(),
      );
      const match = matches.length === 1 ? matches[0] : undefined;
      return {
        sourceCode: source.code,
        sourceName: source.name,
        occurrenceCount: source.count,
        status: matches.length === 1 ? 'MAPPED' : matches.length === 0 ? 'MISSING' : 'AMBIGUOUS',
        ...(match
          ? {
              destinationId: match.id,
              destinationCode: match.code,
              destinationName: match.name,
            }
          : {}),
      };
    });
  }

  private mappingIssues(
    mappings: JsaCopyReferenceMapping[],
    prefix: string,
    blocking: boolean,
    blockers: JsaCopyIssue[],
    warnings: JsaCopyIssue[],
  ) {
    for (const mapping of mappings.filter((item) => item.status !== 'MAPPED')) {
      (blocking ? blockers : warnings).push(
        this.issue(
          `${prefix}_${mapping.status}`,
          `${prefix.replaceAll('_', ' ')} ${mapping.sourceCode} is ${mapping.status.toLowerCase()} at destination`,
          { code: mapping.sourceCode, occurrences: mapping.occurrenceCount },
        ),
      );
    }
  }

  private validateStructure(aggregate: CopyAggregate, blockers: JsaCopyIssue[]) {
    const taskIds = new Set(aggregate.tasks.map((task) => task.id));
    if (
      aggregate.tasks.some(
        (task) => task.parentId && (!taskIds.has(task.parentId) || task.parentId === task.id),
      ) ||
      this.hasTaskCycle(aggregate)
    )
      blockers.push(
        this.issue('SOURCE_TASK_HIERARCHY_INVALID', 'Source Task hierarchy is invalid or cyclic'),
      );
    if (aggregate.hazards.some((hazard) => !taskIds.has(hazard.taskId)))
      blockers.push(
        this.issue('SOURCE_HAZARD_TASK_INVALID', 'A source Hazard references an inactive Task'),
      );
    const hazardIds = new Set(aggregate.hazards.map((hazard) => hazard.id));
    const controls = new Map<string, number>();
    for (const control of aggregate.controls)
      controls.set(control.hazardId, (controls.get(control.hazardId) ?? 0) + 1);
    if (
      aggregate.controls.some((control) => !hazardIds.has(control.hazardId)) ||
      aggregate.hazards.some((hazard) => controls.get(hazard.id) !== 1)
    )
      blockers.push(
        this.issue(
          'HAZARD_CONTROL_INVARIANT_INVALID',
          'Every active source Hazard must have exactly one active Control',
        ),
      );
    const stepIds = new Set(aggregate.steps.map((step) => step.id));
    if (
      aggregate.steps.some((step) => step.taskId && !taskIds.has(step.taskId)) ||
      [...aggregate.performers, ...aggregate.supervisors, ...aggregate.tools].some(
        (assignment) => !stepIds.has(assignment.stepId),
      )
    )
      blockers.push(
        this.issue(
          'SOURCE_BASIC_STEP_STRUCTURE_INVALID',
          'Source Basic Step references are structurally invalid',
        ),
      );
  }

  private hasTaskCycle(aggregate: CopyAggregate) {
    const parents = new Map(aggregate.tasks.map((task) => [task.id, task.parentId]));
    for (const task of aggregate.tasks) {
      const seen = new Set<string>();
      let current: string | undefined = task.id;
      while (current) {
        if (seen.has(current)) return true;
        seen.add(current);
        current = parents.get(current);
      }
    }
    return false;
  }

  private requireSourceScope(source: CopySourceRecord, user: AuthenticatedUser) {
    if (
      !this.scopes.allows(
        user,
        {
          scopeType: 'DEPARTMENT',
          siteId: source.siteId,
          rigId: source.rigId,
          departmentId: source.departmentId,
        },
        'VIEW',
      )
    )
      throw new ResourceNotFoundError('Source JSA was not found');
  }

  private localSiteId() {
    const localSiteId = this.config.get<string>('app.siteId');
    if (!localSiteId) throw new StateConflictError('LOCAL_SITE_ID is required for Cross-Rig Copy');
    return localSiteId;
  }

  private assertInput(input: DestinationInput) {
    for (const [field, value] of Object.entries(input))
      if (field.endsWith('Id') && !/^\d{1,19}$/.test(String(value)))
        throw new ValidationError(`${field} must be a decimal ID string`);
  }

  private hash(jsaId: string, input: DestinationInput, reason: string) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          sourceJsaId: jsaId,
          destinationSiteId: input.destinationSiteId,
          destinationRigId: input.destinationRigId,
          destinationDepartmentId: input.destinationDepartmentId,
          copyReason: reason,
        }),
      )
      .digest('hex');
  }

  private issue(
    code: string,
    message: string,
    context?: Record<string, string | number | boolean>,
  ): JsaCopyIssue {
    return { code, message, ...(context ? { context } : {}) };
  }

  private emptyAggregate(): CopyAggregate {
    return {
      prompts: [],
      tasks: [],
      hazards: [],
      controls: [],
      steps: [],
      performers: [],
      supervisors: [],
      tools: [],
      attachmentNames: [],
      promptCoverageCount: 0,
      procedureReferenceCount: 0,
      legacyHeaderPresent: false,
      invalidRiskReferenceCount: 0,
    };
  }

  private correlationId() {
    return correlationContext.getStore()?.correlationId ?? 'unknown';
  }

  private async requireCopyCapabilities(jsaId: string, user: AuthenticatedUser) {
    try {
      this.capabilities.require(user);
    } catch (error) {
      await this.audit.recordRequired({
        actorUserId: user.userId,
        enterpriseUsername: user.username,
        actionCode: 'JSA_COPY_AUTHORIZATION_DENIED',
        targetType: 'JSA_MASTER',
        targetId: jsaId,
        nextState: { correlationId: this.correlationId() },
      });
      throw error;
    }
  }
}
