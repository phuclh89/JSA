import type {
  JsaVersionCompare,
  JsaVersionHistoryItem,
  JsaVersioningCapabilities,
} from '@jsams/shared-types';
import { apiClient } from '../../services/api-client';

export const versioningApi = {
  capabilities: () =>
    apiClient.get<JsaVersioningCapabilities>('/jsa-versions/capabilities'),
  checkout: (id: string) =>
    apiClient.post<{
      jsaId: string;
      baseVersionId: string;
      workingVersionId: string;
      matrixChanged: boolean;
    }>(`/jsa-versions/${id}/checkout`, {}),
  compare: (id: string) =>
    apiClient.get<JsaVersionCompare>(`/jsa-versions/${id}/compare`),
  reviewCompare: (id: string) =>
    apiClient.get<JsaVersionCompare>(`/jsa-workflow/${id}/review-compare`),
  history: (id: string) =>
    apiClient.get<JsaVersionHistoryItem[]>(`/jsa-versions/${id}/history`),
  undo: (id: string, reason?: string) =>
    apiClient.post<{ status: string }>(`/jsa-versions/${id}/undo-checkout`, {
      reason,
    }),
};

