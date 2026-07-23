import type {
  MasterDataKind,
  MasterDataRecord,
  PaginatedResponse,
  ReferenceScopeType,
} from '@jsams/shared-types';

export interface MasterDataInput {
  code: string;
  name: string;
  description?: string;
  displayOrder: number;
  scopeType: ReferenceScopeType;
  siteId?: string;
  rigId?: string;
  departmentId?: string;
  attributes: Record<string, string | number | boolean | null>;
}

export interface MasterDataListQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  active?: boolean;
  siteId?: string;
  rigId?: string;
  departmentId?: string;
  categoryId?: string;
}

export interface MasterDataMutation extends MasterDataInput {
  rowVersion?: string;
}

export type MasterDataPage = PaginatedResponse<MasterDataRecord>;

export const MASTER_DATA_KINDS: MasterDataKind[] = [
  'job-types',
  'hazard-prompts',
  'positions',
  'tool-categories',
  'tools',
  'languages',
  'procedure-references',
  'system-parameters',
];
