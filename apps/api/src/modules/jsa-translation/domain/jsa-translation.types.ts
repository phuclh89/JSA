import type { TranslationStatus } from '@jsams/shared-types';

export interface TranslationSource {
  jsaId: string;
  versionId: string;
  currentVersionId: string;
  jsaNumber: string;
  jobTitle?: string;
  versionNumber: number;
  versionLabel?: string;
  versionStatus: string;
  lifecycleStatus: string;
  sourceLanguageId: string;
  sourceLanguageCode: string;
  siteId: string;
  rigId: string;
  departmentId: string;
}

export interface TranslationRecord {
  translationId: string;
  jsaId: string;
  sourceVersionId: string;
  status: TranslationStatus;
  cycleNumber: number;
  translatorUserId: string;
  currentAssigneeUserId?: string;
  stcReviewerUserId?: string;
  assignedByUserId: string;
  siteId: string;
  rigId: string;
  departmentId: string;
  rowVersion: string;
}

export interface TranslationSegmentSeed {
  entityType: string;
  sourceEntityId: string;
  sourceLogicalKey: string;
  fieldCode: string;
  sectionCode: string;
  displayOrder: number;
  required: boolean;
  sourceText: string;
}

export interface TranslationActor {
  userId: string;
  username: string;
  displayName: string;
}

export interface TranslationListQuery {
  kind: 'tasks' | 'review' | 'published' | 'outdated';
  userId: string;
  status?: TranslationStatus;
  assigneeUserId?: string;
  searchPattern?: string;
  page: number;
  pageSize: number;
  sort: 'updatedAt' | 'jsaNumber' | 'jobTitle' | 'status';
  direction: 'asc' | 'desc';
}
