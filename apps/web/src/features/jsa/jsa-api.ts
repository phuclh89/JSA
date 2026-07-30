import type {
  JsaDraftCapabilities,
  JsaDraftDetail,
  JsaDraftListItem,
  JsaValidationResult,
  MasterDataRecord,
  OrganizationOption,
  RiskMatrixVersionDetail,
} from '@jsams/shared-types';
import { apiClient } from '../../services/api-client';
export interface CreateJsaDraftRequest {
  ownerSiteId: string;
  rigId: string;
  departmentId: string;
}
export const jsaApi = {
  capabilities: () => apiClient.get<JsaDraftCapabilities>('/jsa-drafts/capabilities'),
  myDrafts: (rigId?: string) =>
    apiClient.get<JsaDraftListItem[]>(`/jsa-drafts/mine${rigId ? `?rigId=${rigId}` : ''}`),
  options: <T = MasterDataRecord>(kind: string, query = '') =>
    apiClient.get<T[]>(`/jsa-drafts/options/${kind}${query}`),
  attachmentPicker: <T>(query: string) => apiClient.get<T>(`/attachment-library/picker?${query}`),
  matrix: (rigId: string) =>
    apiClient.get<RiskMatrixVersionDetail>(`/jsa-drafts/effective-matrix/${rigId}`),
  create: (body: CreateJsaDraftRequest) => apiClient.post<JsaDraftDetail>('/jsa-drafts', body),
  detail: (id: string) => apiClient.get<JsaDraftDetail>(`/jsa-drafts/${id}`),
  printDetail: (id: string) => apiClient.get<JsaDraftDetail>(`/jsa-drafts/${id}/print`),
  save: (id: string, body: unknown) =>
    apiClient.put<JsaDraftDetail>(`/jsa-drafts/${id}/save`, body),
  header: (id: string, body: unknown) => apiClient.put<JsaDraftDetail>(`/jsa-drafts/${id}`, body),
  content: (id: string, body: unknown) =>
    apiClient.put<JsaDraftDetail>(`/jsa-drafts/${id}/content`, body),
  validate: (id: string) => apiClient.post<JsaValidationResult>(`/jsa-drafts/${id}/validate`, {}),
  cancel: (id: string, body: unknown) =>
    apiClient.post<{ status: string }>(`/jsa-drafts/${id}/cancel`, body),
};
export type { OrganizationOption };
