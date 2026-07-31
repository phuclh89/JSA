import type {
  JsaBrowseCapabilities,
  JsaBrowseKind,
  JsaBrowseFacets,
  JsaBrowseResult,
  JsaRiskStage,
  JsaSearchField,
} from '@jsams/shared-types';
import { apiClient } from '../../services/api-client';

export interface BrowseParameters {
  kind: JsaBrowseKind;
  rigId?: string;
  departmentId?: string;
  siteId?: string;
  keyword?: string;
  searchField: JsaSearchField;
  workingStatus?: string;
  officialStatus?: string;
  riskResult?: string;
  riskStage?: JsaRiskStage;
  activeUpdate?: boolean;
  favorite?: boolean;
  matrixVersionId?: string;
  creator?: string;
  approver?: string;
  createdFrom?: string;
  createdTo?: string;
  publishedFrom?: string;
  publishedTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  page: number;
  pageSize: number;
  sort: string;
  direction: 'asc' | 'desc';
}

function path(parameters: BrowseParameters) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters))
    if (value !== undefined && value !== '') query.set(key, String(value));
  return `/jsa-browse?${query.toString()}`;
}

export const browseApi = {
  capabilities: () => apiClient.get<JsaBrowseCapabilities>('/jsa-browse/capabilities'),
  list: (parameters: BrowseParameters) => apiClient.get<JsaBrowseResult>(path(parameters)),
  counts: (rigId?: string) =>
    apiClient.get<{ all: number; favorites: number }>(
      `/jsa-browse/counts${rigId ? `?rigId=${encodeURIComponent(rigId)}` : ''}`,
    ),
  facets: (rigId?: string) =>
    apiClient.get<JsaBrowseFacets>(
      `/jsa-browse/facets${rigId ? `?rigId=${encodeURIComponent(rigId)}` : ''}`,
    ),
  favorite: (jsaId: string) =>
    apiClient.postEmpty<{ jsaId: string; favorite: boolean; changed: boolean }>(
      `/jsa-browse/${jsaId}/favorite`,
    ),
  unfavorite: (jsaId: string) =>
    apiClient.delete<{ jsaId: string; favorite: boolean; changed: boolean }>(
      `/jsa-browse/${jsaId}/favorite`,
    ),
};
