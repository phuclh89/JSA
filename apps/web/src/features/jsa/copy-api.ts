import type {
  JsaCopyCapabilities,
  JsaCopyDestinationOptions,
  JsaCopyPreflight,
  JsaCopyProvenance,
  JsaCopyResult,
} from '@jsams/shared-types';
import { apiClient } from '../../services/api-client';

export interface CopyDestinationRequest {
  destinationSiteId: string;
  destinationRigId: string;
  destinationDepartmentId: string;
}

export const copyApi = {
  capabilities: () => apiClient.get<JsaCopyCapabilities>('/jsa/copy-capabilities'),
  destinations: (jsaId: string) =>
    apiClient.get<JsaCopyDestinationOptions>(`/jsa/${jsaId}/copy-destinations`),
  preflight: (jsaId: string, body: CopyDestinationRequest) =>
    apiClient.post<JsaCopyPreflight>(`/jsa/${jsaId}/copy-preflight`, body),
  copy: (
    jsaId: string,
    body: CopyDestinationRequest & { copyReason: string; acknowledgeWarnings: boolean },
    requestKey: string,
  ) =>
    apiClient.postWithHeaders<JsaCopyResult>(`/jsa/${jsaId}/copy`, body, {
      'Idempotency-Key': requestKey,
    }),
  provenance: async (jsaId: string) => {
    try {
      return (
        (await apiClient.get<JsaCopyProvenance | null>(`/jsa/${jsaId}/copy-provenance`)) ?? null
      );
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404)
        return null;
      throw error;
    }
  },
};
