import type {
  JsaBrowseKind,
  JsaRiskStage,
  JsaSearchField,
} from '@jsams/shared-types';

export interface JsaBrowseQuery {
  kind: JsaBrowseKind;
  userId: string;
  rigId?: string;
  siteId?: string;
  departmentId?: string;
  officialStatus?: 'TEMPORARY' | 'OFFICIAL';
  workingStatus?: string;
  matrixVersionId?: string;
  riskResult?: string;
  riskStage: JsaRiskStage;
  createdFrom?: Date;
  createdTo?: Date;
  publishedFrom?: Date;
  publishedTo?: Date;
  updatedFrom?: Date;
  updatedTo?: Date;
  creator?: string;
  approver?: string;
  activeUpdate?: boolean;
  favorite?: boolean;
  keyword?: string;
  searchPattern?: string;
  searchField: JsaSearchField;
  page: number;
  pageSize: number;
  sort: 'updatedAt' | 'createdAt' | 'publishedAt' | 'jsaNumber' | 'jobTitle';
  direction: 'asc' | 'desc';
}
