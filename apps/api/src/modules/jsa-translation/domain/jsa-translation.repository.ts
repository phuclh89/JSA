import type {
  PublishedTranslationOption,
  TranslationAction,
  TranslationCandidate,
  TranslationDetail,
  TranslationListItem,
  TranslationNavigationCounts,
} from '@jsams/shared-types';
import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import type {
  TranslationActor,
  TranslationListQuery,
  TranslationRecord,
  TranslationSegmentSeed,
  TranslationSource,
} from './jsa-translation.types';

export const JSA_TRANSLATION_REPOSITORY = Symbol('JSA_TRANSLATION_REPOSITORY');

export interface JsaTranslationRepository {
  source(
    context: OracleTransactionContext,
    jsaId: string,
    lock?: boolean,
  ): Promise<TranslationSource | undefined>;
  translation(
    context: OracleTransactionContext,
    id: string,
    lock?: boolean,
  ): Promise<TranslationRecord | undefined>;
  actorHasWorkflowRole(
    context: OracleTransactionContext,
    userId: string,
    roleCode: 'OIM' | 'TRANSLATOR' | 'STC',
    target: Pick<TranslationSource, 'siteId' | 'rigId' | 'departmentId'>,
  ): Promise<boolean>;
  languages(
    context: OracleTransactionContext,
  ): Promise<Array<{ id: string; code: string; name: string }>>;
  candidates(
    context: OracleTransactionContext,
    roleCode: 'TRANSLATOR' | 'STC',
    permissionCode: string,
    target: Pick<TranslationSource, 'siteId' | 'rigId' | 'departmentId'>,
  ): Promise<TranslationCandidate[]>;
  segmentSeeds(
    context: OracleTransactionContext,
    versionId: string,
  ): Promise<TranslationSegmentSeed[]>;
  create(
    context: OracleTransactionContext,
    source: TranslationSource,
    targetLanguageId: string,
    translator: TranslationCandidate,
    actor: TranslationActor,
    seeds: TranslationSegmentSeed[],
    previousTranslationId: string | undefined,
    correlationId: string,
  ): Promise<string>;
  list(
    context: OracleTransactionContext,
    query: TranslationListQuery,
  ): Promise<{
    items: TranslationListItem[];
    page: number;
    pageSize: number;
    total: number;
  }>;
  publishedForJsa(
    context: OracleTransactionContext,
    jsaId: string,
    userId: string,
  ): Promise<PublishedTranslationOption[]>;
  detail(context: OracleTransactionContext, id: string): Promise<TranslationDetail | undefined>;
  save(
    context: OracleTransactionContext,
    record: TranslationRecord,
    segments: Array<{ id: string; text: string; rowVersion: string }>,
    actor: TranslationActor,
    correlationId: string,
  ): Promise<void>;
  submit(
    context: OracleTransactionContext,
    record: TranslationRecord,
    reviewer: TranslationCandidate,
    actor: TranslationActor,
    correlationId: string,
  ): Promise<void>;
  review(
    context: OracleTransactionContext,
    record: TranslationRecord,
    action: 'RETURN' | 'COMMENT' | 'PUBLISH',
    comment: string | undefined,
    actor: TranslationActor,
    correlationId: string,
  ): Promise<void>;
  refreshEvidence(
    context: OracleTransactionContext,
    oldRecord: TranslationRecord,
    newTranslationId: string,
    actor: TranslationActor,
    correlationId: string,
  ): Promise<void>;
  actions(context: OracleTransactionContext, id: string): Promise<TranslationAction[]>;
  counts(context: OracleTransactionContext, userId: string): Promise<TranslationNavigationCounts>;
}
