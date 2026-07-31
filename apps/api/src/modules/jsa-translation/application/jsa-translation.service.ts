import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser, TranslationDetail, TranslationStatus } from '@jsams/shared-types';
import { randomUUID } from 'node:crypto';
import {
  AccessDeniedError,
  DataScopeDeniedError,
  ResourceNotFoundError,
  StateConflictError,
  ValidationError,
} from '../../../common/errors/application-errors';
import { assertOracleId } from '../../../common/oracle/oracle-id';
import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import { OracleService } from '../../../common/oracle/oracle.service';
import { DataScopeService } from '../../security/application/data-scope.service';
import {
  JSA_TRANSLATION_REPOSITORY,
  type JsaTranslationRepository,
} from '../domain/jsa-translation.repository';
import type {
  TranslationActor,
  TranslationListQuery,
  TranslationSource,
} from '../domain/jsa-translation.types';
import { JsaTranslationCapabilityService } from './jsa-translation-capability.service';

@Injectable()
export class JsaTranslationService {
  constructor(
    private readonly oracle: OracleService,
    private readonly config: ConfigService,
    private readonly scopes: DataScopeService,
    private readonly capabilities: JsaTranslationCapabilityService,
    @Inject(JSA_TRANSLATION_REPOSITORY) private readonly repository: JsaTranslationRepository,
  ) {}

  capabilityState(user: AuthenticatedUser) {
    return this.capabilities.state(user);
  }

  async assignmentPreflight(jsaId: string, user: AuthenticatedUser) {
    this.capabilities.require(user, 'assign');
    return this.oracle.withTransaction(async (context) => {
      const source = await this.requireAssignableSource(context, jsaId, user);
      const languages = await this.repository.languages(context);
      return {
        source,
        languages,
        configured: languages.length > 0,
        blockers: languages.length ? [] : ['No active governed non-English target language exists'],
      };
    });
  }

  async translatorCandidates(jsaId: string, user: AuthenticatedUser) {
    this.capabilities.require(user, 'assign');
    return this.oracle.withTransaction(async (context) => {
      const source = await this.requireAssignableSource(context, jsaId, user);
      return this.repository.candidates(
        context,
        'TRANSLATOR',
        this.capabilities.code('translate'),
        source,
      );
    });
  }

  async assign(
    input: { jsaId: string; targetLanguageId: string; translatorUserId: string },
    user: AuthenticatedUser,
  ) {
    this.capabilities.require(user, 'assign');
    for (const [name, value] of Object.entries(input)) assertOracleId(value, name);
    return this.oracle.withTransaction(async (context) => {
      const source = await this.requireAssignableSource(context, input.jsaId, user, true);
      const candidates = await this.repository.candidates(
        context,
        'TRANSLATOR',
        this.capabilities.code('translate'),
        source,
      );
      const translator = candidates.find(
        (candidate) => candidate.userId === input.translatorUserId,
      );
      if (!translator) throw new StateConflictError('Selected Translator is no longer eligible');
      const seeds = await this.repository.segmentSeeds(context, source.versionId);
      if (!seeds.length)
        throw new StateConflictError('Published source has no translatable segments');
      const id = await this.repository.create(
        context,
        source,
        input.targetLanguageId,
        translator,
        this.actor(user),
        seeds,
        undefined,
        randomUUID(),
      );
      return { translationId: id, route: `/jsa/translations/${id}` };
    });
  }

  async refresh(id: string, input: { translatorUserId: string }, user: AuthenticatedUser) {
    this.capabilities.require(user, 'assign');
    assertOracleId(id, 'translationId');
    assertOracleId(input.translatorUserId, 'translatorUserId');
    return this.oracle.withTransaction(async (context) => {
      const old = await this.repository.translation(context, id, true);
      if (!old) throw new ResourceNotFoundError('Translation was not found');
      if (old.status !== 'OUTDATED')
        throw new StateConflictError('Only an Outdated Translation can be refreshed');
      const detail = await this.repository.detail(context, id);
      if (!detail) throw new ResourceNotFoundError('Translation was not found');
      const source = await this.requireAssignableSource(context, old.jsaId, user, true);
      if (source.versionId === old.sourceVersionId)
        throw new StateConflictError('No replacement Published source Version is available');
      const candidates = await this.repository.candidates(
        context,
        'TRANSLATOR',
        this.capabilities.code('translate'),
        source,
      );
      const translator = candidates.find(
        (candidate) => candidate.userId === input.translatorUserId,
      );
      if (!translator) throw new StateConflictError('Selected Translator is no longer eligible');
      const seeds = await this.repository.segmentSeeds(context, source.versionId);
      const newId = await this.repository.create(
        context,
        source,
        detail.targetLanguageId,
        translator,
        this.actor(user),
        seeds,
        id,
        randomUUID(),
      );
      await this.repository.refreshEvidence(context, old, newId, this.actor(user), randomUUID());
      return {
        translationId: newId,
        previousTranslationId: id,
        route: `/jsa/translations/${newId}`,
      };
    });
  }

  async list(
    kind: 'tasks' | 'review' | 'published' | 'outdated',
    raw: Record<string, string | undefined>,
    user: AuthenticatedUser,
  ) {
    this.capabilities.require(user, 'view');
    if (kind === 'tasks') this.capabilities.require(user, 'translate');
    if (kind === 'review') this.capabilities.require(user, 'approve');
    const query = this.parseListQuery(kind, raw, user);
    return this.oracle.withTransaction((context) => this.repository.list(context, query));
  }

  async publishedForJsa(jsaId: string, user: AuthenticatedUser) {
    this.capabilities.require(user, 'view');
    assertOracleId(jsaId, 'jsaId');
    return this.oracle.withTransaction((context) =>
      this.repository.publishedForJsa(context, jsaId, user.userId),
    );
  }

  async detail(id: string, user: AuthenticatedUser) {
    this.capabilities.require(user, 'view');
    assertOracleId(id, 'translationId');
    return this.oracle.withTransaction(async (context) => {
      const detail = await this.repository.detail(context, id);
      if (!detail) throw new ResourceNotFoundError('Translation was not found');
      this.requireView(detail, user);
      return this.decorate(detail, user);
    });
  }

  async save(
    id: string,
    input: { segments: Array<{ id: string; text: string; rowVersion: string }> },
    user: AuthenticatedUser,
  ) {
    this.capabilities.require(user, 'translate');
    if (!Array.isArray(input.segments) || !input.segments.length)
      throw new ValidationError('At least one Translation segment is required');
    for (const segment of input.segments) {
      assertOracleId(segment.id, 'segmentId');
      assertOracleId(segment.rowVersion, 'rowVersion');
      if (typeof segment.text !== 'string')
        throw new ValidationError('Translated segment text must be plain text');
      if (segment.text.includes('\u0000'))
        throw new ValidationError('Translated segment text contains an unsupported character');
    }
    return this.oracle.withTransaction(async (context) => {
      const record = await this.requireRecord(context, id, true);
      if (!['ASSIGNED', 'IN_TRANSLATION', 'RETURNED'].includes(record.status))
        throw new StateConflictError('Translation is not editable');
      if (record.currentAssigneeUserId !== user.userId || record.translatorUserId !== user.userId)
        throw new AccessDeniedError();
      await this.repository.save(context, record, input.segments, this.actor(user), randomUUID());
      return { translationId: id, status: 'IN_TRANSLATION' };
    });
  }

  async submit(id: string, user: AuthenticatedUser) {
    this.capabilities.require(user, 'translate');
    return this.oracle.withTransaction(async (context) => {
      const record = await this.requireRecord(context, id, true);
      if (!['ASSIGNED', 'IN_TRANSLATION', 'RETURNED'].includes(record.status))
        throw new StateConflictError('Translation cannot be submitted in its current status');
      if (record.currentAssigneeUserId !== user.userId || record.translatorUserId !== user.userId)
        throw new AccessDeniedError();
      const source = await this.requireCurrentSource(context, record.jsaId, record.sourceVersionId);
      const reviewers = await this.repository.candidates(
        context,
        'STC',
        this.capabilities.code('approve'),
        source,
      );
      const eligible = record.stcReviewerUserId
        ? reviewers.filter((candidate) => candidate.userId === record.stcReviewerUserId)
        : reviewers;
      if (eligible.length !== 1)
        throw new StateConflictError('Exactly one eligible STC reviewer is required');
      await this.repository.submit(context, record, eligible[0]!, this.actor(user), randomUUID());
      return { translationId: id, status: 'STC_REVIEW' };
    });
  }

  async review(
    id: string,
    input: { action: 'RETURN' | 'COMMENT' | 'PUBLISH'; comment?: string },
    user: AuthenticatedUser,
  ) {
    this.capabilities.require(user, 'approve');
    if (!['RETURN', 'COMMENT', 'PUBLISH'].includes(input.action))
      throw new ValidationError('Unsupported Translation review action');
    if (input.action === 'RETURN' && !input.comment?.trim())
      throw new ValidationError('A return comment is required');
    if (input.comment && input.comment.trim().length > 2000)
      throw new ValidationError('Translation review comment must not exceed 2000 characters');
    return this.oracle.withTransaction(async (context) => {
      const record = await this.requireRecord(context, id, true);
      if (record.status !== 'STC_REVIEW')
        throw new StateConflictError('Translation is not in STC review');
      if (record.currentAssigneeUserId !== user.userId || record.stcReviewerUserId !== user.userId)
        throw new AccessDeniedError();
      const source = await this.requireCurrentSource(context, record.jsaId, record.sourceVersionId);
      const stillStc = await this.repository.actorHasWorkflowRole(
        context,
        user.userId,
        'STC',
        source,
      );
      if (!stillStc) throw new AccessDeniedError();
      await this.repository.review(
        context,
        record,
        input.action,
        input.comment?.trim(),
        this.actor(user),
        randomUUID(),
      );
      return {
        translationId: id,
        status:
          input.action === 'RETURN'
            ? 'RETURNED'
            : input.action === 'PUBLISH'
              ? 'PUBLISHED'
              : 'STC_REVIEW',
      };
    });
  }

  async actions(id: string, user: AuthenticatedUser) {
    await this.detail(id, user);
    return this.oracle.withTransaction((context) => this.repository.actions(context, id));
  }

  async counts(user: AuthenticatedUser) {
    this.capabilities.require(user, 'view');
    return this.oracle.withTransaction((context) => this.repository.counts(context, user.userId));
  }

  async print(id: string, user: AuthenticatedUser) {
    this.capabilities.require(user, 'print');
    const detail = await this.detail(id, user);
    if (detail.status !== 'PUBLISHED')
      throw new StateConflictError('Only a Published Translation can be printed');
    return this.oracle.withTransaction(async (context) => {
      await this.requireCurrentSource(context, detail.jsaId, detail.sourceVersionId);
      return { ...detail, staticLabelsLocalized: false };
    });
  }

  private async requireAssignableSource(
    context: OracleTransactionContext,
    jsaId: string,
    user: AuthenticatedUser,
    lock = false,
  ) {
    const source = await this.repository.source(context, jsaId, lock);
    if (!source) throw new ResourceNotFoundError('JSA was not found');
    this.validatePublishedEnglish(source);
    const localSiteId = this.config.get<string>('LOCAL_SITE_ID');
    if (!localSiteId || source.siteId !== localSiteId)
      throw new StateConflictError(
        'Translation writes are restricted to the configured local Site',
      );
    if (!this.scopes.allows(user, this.scope(source), 'ACT')) throw new DataScopeDeniedError();
    if (!(await this.repository.actorHasWorkflowRole(context, user.userId, 'OIM', source)))
      throw new AccessDeniedError();
    return source;
  }

  private async requireCurrentSource(
    context: OracleTransactionContext,
    jsaId: string,
    versionId: string,
  ) {
    const source = await this.repository.source(context, jsaId);
    if (!source) throw new ResourceNotFoundError('JSA was not found');
    this.validatePublishedEnglish(source);
    if (source.currentVersionId !== versionId)
      throw new StateConflictError('Translation source is no longer the Current Published Version');
    return source;
  }

  private validatePublishedEnglish(source: TranslationSource) {
    if (
      source.lifecycleStatus !== 'PUBLISHED' ||
      source.versionStatus !== 'PUBLISHED' ||
      source.currentVersionId !== source.versionId
    )
      throw new StateConflictError(
        'Translation source must be the exact Current Published Version',
      );
    if (source.sourceLanguageCode.toUpperCase() !== 'EN')
      throw new StateConflictError('Translation source must be English');
  }

  private async requireRecord(context: OracleTransactionContext, id: string, lock = false) {
    assertOracleId(id, 'translationId');
    const record = await this.repository.translation(context, id, lock);
    if (!record) throw new ResourceNotFoundError('Translation was not found');
    return record;
  }

  private requireView(detail: TranslationDetail, user: AuthenticatedUser) {
    if (!this.scopes.allows(user, this.scope(detail), 'VIEW')) throw new DataScopeDeniedError();
    const ownTask =
      detail.translatorUserId === user.userId &&
      ['ASSIGNED', 'IN_TRANSLATION', 'RETURNED'].includes(detail.status);
    const ownReview = detail.status === 'STC_REVIEW' && detail.stcReviewerUserId === user.userId;
    const publicState = ['PUBLISHED', 'OUTDATED'].includes(detail.status);
    if (!ownTask && !ownReview && !publicState) throw new AccessDeniedError();
  }

  private decorate(detail: TranslationDetail, user: AuthenticatedUser): TranslationDetail {
    return {
      ...detail,
      editable:
        detail.translatorUserId === user.userId &&
        ['ASSIGNED', 'IN_TRANSLATION', 'RETURNED'].includes(detail.status) &&
        this.capabilities.state(user).translate,
      reviewable:
        detail.status === 'STC_REVIEW' &&
        detail.stcReviewerUserId === user.userId &&
        this.capabilities.state(user).approve,
      printable: detail.status === 'PUBLISHED' && this.capabilities.state(user).print,
    };
  }

  private scope(target: {
    ownerSiteId?: string;
    siteId?: string;
    rigId: string;
    departmentId: string;
  }) {
    return {
      scopeType: 'DEPARTMENT' as const,
      siteId: target.ownerSiteId ?? target.siteId ?? '',
      rigId: target.rigId,
      departmentId: target.departmentId,
    };
  }

  private actor(user: AuthenticatedUser): TranslationActor {
    return { userId: user.userId, username: user.username, displayName: user.displayName };
  }

  private parseListQuery(
    kind: TranslationListQuery['kind'],
    raw: Record<string, string | undefined>,
    user: AuthenticatedUser,
  ): TranslationListQuery {
    const page = boundedInteger(raw.page, 1, 1, 1_000_000, 'page');
    const pageSize = boundedInteger(raw.pageSize, 25, 1, 100, 'pageSize');
    const sort = (raw.sort ?? 'updatedAt') as TranslationListQuery['sort'];
    const direction = (raw.direction ?? 'desc').toLowerCase() as 'asc' | 'desc';
    if (!['updatedAt', 'jsaNumber', 'jobTitle', 'status'].includes(sort))
      throw new ValidationError('Unsupported Translation list sort');
    if (!['asc', 'desc'].includes(direction))
      throw new ValidationError('Unsupported Translation list direction');
    const status = raw.status?.trim().toUpperCase() as TranslationStatus | undefined;
    if (
      status &&
      !['ASSIGNED', 'IN_TRANSLATION', 'STC_REVIEW', 'RETURNED', 'PUBLISHED', 'OUTDATED'].includes(
        status,
      )
    )
      throw new ValidationError('Unknown Translation status');
    const keyword = raw.keyword?.trim();
    if (keyword && (keyword.length < 2 || keyword.length > 200))
      throw new ValidationError('Translation search must contain 2 to 200 characters');
    const assigneeUserId = raw.assigneeUserId?.trim();
    if (assigneeUserId) {
      assertOracleId(assigneeUserId, 'assigneeUserId');
      if (!this.capabilities.state(user).assign) throw new AccessDeniedError();
    }
    return {
      kind,
      userId: user.userId,
      page,
      pageSize,
      sort,
      direction,
      ...(status ? { status } : {}),
      ...(assigneeUserId ? { assigneeUserId } : {}),
      ...(keyword
        ? { searchPattern: `%${keyword.replace(/[\\%_]/g, '\\$&').toUpperCase()}%` }
        : {}),
    };
  }
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string,
) {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new ValidationError(`${field} must be an integer from ${minimum} to ${maximum}`);
  return value;
}
