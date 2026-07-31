import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AuthenticatedUser,
  JsaBrowseKind,
  JsaRiskStage,
  JsaSearchField,
} from '@jsams/shared-types';
import {
  StateConflictError,
  ValidationError,
} from '../../../common/errors/application-errors';
import { assertOracleId } from '../../../common/oracle/oracle-id';
import { OracleService } from '../../../common/oracle/oracle.service';
import { SecurityAuditService } from '../../security/application/security-audit.service';
import {
  JSA_BROWSE_REPOSITORY,
  type JsaBrowseRepository,
} from '../domain/jsa-browse.repository';
import type { JsaBrowseQuery } from '../domain/jsa-browse.types';
import { JsaBrowseCapabilityService } from './jsa-browse-capability.service';

const kinds = new Set<JsaBrowseKind>([
  'published',
  'favorites',
  'all',
  'drafts',
  'approvals',
  'pending',
  'rejected',
]);
const fields = new Set<JsaSearchField>([
  'ALL',
  'JSA_NUMBER',
  'JOB_TITLE',
  'TASK',
  'HAZARD',
  'CONTROL',
  'PROMPT',
  'CREATOR',
  'APPROVER',
]);
const riskStages = new Set<JsaRiskStage>(['INITIAL', 'RESIDUAL', 'EITHER']);
const workingStatuses = new Set([
  'DRAFT',
  'DEPARTMENT_HEAD_REVIEW',
  'STC_REVIEW',
  'OIM_REVIEW',
  'RIG_MANAGER_REVIEW',
  'RETURNED',
  'REJECTED',
]);
const sorts = new Set<JsaBrowseQuery['sort']>([
  'updatedAt',
  'createdAt',
  'publishedAt',
  'jsaNumber',
  'jobTitle',
]);

@Injectable()
export class JsaBrowseService {
  constructor(
    private readonly oracle: OracleService,
    private readonly config: ConfigService,
    private readonly capabilities: JsaBrowseCapabilityService,
    private readonly audit: SecurityAuditService,
    @Inject(JSA_BROWSE_REPOSITORY) private readonly repository: JsaBrowseRepository,
  ) {}

  capabilityState(user: AuthenticatedUser) {
    return this.capabilities.state(user);
  }

  async browse(raw: Record<string, string | undefined>, user: AuthenticatedUser) {
    const query = this.parse(raw, user.userId);
    this.capabilities.requireView(user, query.kind);
    if (query.kind === 'favorites' || query.favorite === true)
      this.capabilities.requireFavorite(user);
    return this.oracle.withTransaction((context) => this.repository.browse(context, query));
  }

  async counts(user: AuthenticatedUser, rigId?: string) {
    this.capabilities.requireView(user, 'all');
    if (rigId) assertOracleId(rigId, 'rigId');
    const [all, favorites] = await this.oracle.withTransaction(async (context) => {
      const allCount = await this.repository.allCount(context, user.userId, rigId);
      const favoriteCode = this.config.get<string>('JSA_PERMISSION_FAVORITE');
      const favoriteCount =
        favoriteCode && user.permissions.includes(favoriteCode)
          ? await this.repository.favoriteCount(context, user.userId, rigId)
          : 0;
      return [allCount, favoriteCount];
    });
    return { all, favorites };
  }

  async facets(user: AuthenticatedUser, rigId?: string) {
    this.capabilities.requireView(user, 'all');
    if (rigId) assertOracleId(rigId, 'rigId');
    return this.oracle.withTransaction((context) =>
      this.repository.facets(context, user.userId, rigId),
    );
  }

  async favorite(jsaId: string, active: boolean, user: AuthenticatedUser) {
    assertOracleId(jsaId, 'jsaId');
    this.capabilities.requireView(user, 'published');
    this.capabilities.requireFavorite(user);
    const localSiteId = this.config.get<string>('app.siteId');
    if (!localSiteId)
      throw new StateConflictError('LOCAL_SITE_ID is required for favorite writes');
    assertOracleId(localSiteId, 'LOCAL_SITE_ID');
    const changed = await this.oracle.withTransaction((context) =>
      this.repository.setFavorite(context, {
        jsaId,
        userId: user.userId,
        username: user.username,
        localSiteId,
        active,
      }),
    );
    if (changed)
      await this.audit.recordRequired({
        actorUserId: user.userId,
        enterpriseUsername: user.username,
        actionCode: active ? 'JSA_FAVORITE' : 'JSA_UNFAVORITE',
        targetType: 'JSA_MASTER',
        targetId: jsaId,
        nextState: { favorite: active },
      });
    return { jsaId, favorite: active, changed };
  }

  private parse(raw: Record<string, string | undefined>, userId: string): JsaBrowseQuery {
    const kind = (raw.kind ?? 'published') as JsaBrowseKind;
    const searchField = (raw.searchField ?? 'ALL').toUpperCase() as JsaSearchField;
    const riskStage = (raw.riskStage ?? 'EITHER').toUpperCase() as JsaRiskStage;
    const sort = (raw.sort ?? 'updatedAt') as JsaBrowseQuery['sort'];
    const direction = (raw.direction ?? 'desc').toLowerCase() as 'asc' | 'desc';
    if (!kinds.has(kind)) throw new ValidationError('Unknown JSA browse kind');
    if (!fields.has(searchField)) throw new ValidationError('Unknown JSA search field');
    if (!riskStages.has(riskStage)) throw new ValidationError('Unknown risk stage');
    if (!sorts.has(sort) || !['asc', 'desc'].includes(direction))
      throw new ValidationError('Unsupported sort');
    const page = boundedInteger(raw.page, 1, 1, 1_000_000, 'page');
    const pageSize = boundedInteger(raw.pageSize, 25, 1, 100, 'pageSize');
    const keyword = raw.keyword?.trim();
    if (keyword && keyword.length < 2)
      throw new ValidationError('Search keyword must contain at least 2 characters');
    if (keyword && keyword.length > 200)
      throw new ValidationError('Search keyword must not exceed 200 characters');
    const workingStatus = raw.workingStatus?.toUpperCase();
    if (workingStatus && !workingStatuses.has(workingStatus))
      throw new ValidationError('Unknown Working Version status');
    const officialStatus = raw.officialStatus?.toUpperCase();
    if (officialStatus && !['TEMPORARY', 'OFFICIAL'].includes(officialStatus))
      throw new ValidationError('Unknown official-number status');
    const ids = ['rigId', 'siteId', 'departmentId', 'matrixVersionId'] as const;
    for (const id of ids) if (raw[id]) assertOracleId(raw[id]!, id);
    return {
      kind,
      userId,
      searchField,
      riskStage,
      sort,
      direction,
      page,
      pageSize,
      ...(keyword
        ? { keyword, searchPattern: `%${keyword.replace(/[\\%_]/g, '\\$&').toUpperCase()}%` }
        : {}),
      ...(raw.rigId ? { rigId: raw.rigId } : {}),
      ...(raw.siteId ? { siteId: raw.siteId } : {}),
      ...(raw.departmentId ? { departmentId: raw.departmentId } : {}),
      ...(raw.matrixVersionId ? { matrixVersionId: raw.matrixVersionId } : {}),
      ...(raw.riskResult?.trim() ? { riskResult: raw.riskResult.trim().toUpperCase() } : {}),
      ...(raw.creator?.trim() ? { creator: raw.creator.trim().toUpperCase() } : {}),
      ...(raw.approver?.trim() ? { approver: raw.approver.trim().toUpperCase() } : {}),
      ...(workingStatus ? { workingStatus } : {}),
      ...(officialStatus ? { officialStatus: officialStatus as 'TEMPORARY' | 'OFFICIAL' } : {}),
      ...optionalBoolean(raw.activeUpdate, 'activeUpdate'),
      ...optionalBoolean(raw.favorite, 'favorite'),
      ...optionalDate(raw.createdFrom, 'createdFrom'),
      ...optionalDate(raw.createdTo, 'createdTo'),
      ...optionalDate(raw.publishedFrom, 'publishedFrom'),
      ...optionalDate(raw.publishedTo, 'publishedTo'),
      ...optionalDate(raw.updatedFrom, 'updatedFrom'),
      ...optionalDate(raw.updatedTo, 'updatedTo'),
    };
  }
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new ValidationError(`${name} must be an integer`);
  const number = Number(value);
  if (number < min || number > max) throw new ValidationError(`${name} is out of range`);
  return number;
}

function optionalBoolean(value: string | undefined, name: 'activeUpdate' | 'favorite') {
  if (value === undefined) return {};
  if (!['true', 'false'].includes(value))
    throw new ValidationError(`${name} must be true or false`);
  return { [name]: value === 'true' };
}

function optionalDate(
  value: string | undefined,
  name:
    | 'createdFrom'
    | 'createdTo'
    | 'publishedFrom'
    | 'publishedTo'
    | 'updatedFrom'
    | 'updatedTo',
) {
  if (!value) return {};
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new ValidationError(`${name} must be an ISO date`);
  return { [name]: parsed };
}
