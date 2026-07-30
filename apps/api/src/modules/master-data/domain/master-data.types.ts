import type {
  MasterDataKind,
  MasterDataRecord,
  OrganizationKind,
  OrganizationRecord,
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
export type OrganizationPage = PaginatedResponse<OrganizationRecord>;

export interface OrganizationInput {
  code: string;
  name: string;
  siteId: string;
  rigId?: string;
}

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

export const ORGANIZATION_KINDS: OrganizationKind[] = ['rigs', 'departments'];
