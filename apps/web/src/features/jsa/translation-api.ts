import type {
  PublishedTranslationOption,
  TranslationCapabilities,
  TranslationCandidate,
  TranslationDetail,
  TranslationListResult,
  TranslationNavigationCounts,
} from '@jsams/shared-types';
import { apiClient } from '../../services/api-client';

export const translationApi = {
  capabilities: () => apiClient.get<TranslationCapabilities>('/jsa-translations/capabilities'),
  preflight: (jsaId: string) =>
    apiClient.get<{
      source: { jsaId: string; jsaNumber: string; jobTitle?: string; versionNumber: number };
      languages: Array<{ id: string; code: string; name: string }>;
      configured: boolean;
      blockers: string[];
    }>(`/jsa-translations/assignment-preflight/${jsaId}`),
  candidates: (jsaId: string) =>
    apiClient.get<TranslationCandidate[]>(`/jsa-translations/translator-candidates/${jsaId}`),
  assign: (body: { jsaId: string; targetLanguageId: string; translatorUserId: string }) =>
    apiClient.post<{ translationId: string; route: string }>('/jsa-translations/assign', body),
  list: (
    kind: 'tasks' | 'review' | 'published' | 'outdated',
    query: {
      page: number;
      pageSize: number;
      keyword?: string;
      status?: string;
      sort?: string;
      direction?: 'asc' | 'desc';
    },
  ) => {
    const params = new URLSearchParams({
      page: String(query.page),
      pageSize: String(query.pageSize),
      ...(query.keyword ? { keyword: query.keyword } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.sort ? { sort: query.sort } : {}),
      ...(query.direction ? { direction: query.direction } : {}),
    });
    return apiClient.get<TranslationListResult>(`/jsa-translations/${kind}?${params}`);
  },
  detail: (id: string) => apiClient.get<TranslationDetail>(`/jsa-translations/${id}`),
  save: (id: string, segments: Array<{ id: string; text: string; rowVersion: string }>) =>
    apiClient.put(`/jsa-translations/${id}/segments`, { segments }),
  submit: (id: string) => apiClient.postEmpty(`/jsa-translations/${id}/submit`),
  review: (id: string, action: 'RETURN' | 'COMMENT' | 'PUBLISH', comment?: string) =>
    apiClient.post(`/jsa-translations/${id}/review`, { action, comment }),
  refresh: (id: string, translatorUserId: string) =>
    apiClient.post<{ translationId: string; route: string }>(`/jsa-translations/${id}/refresh`, {
      translatorUserId,
    }),
  counts: () => apiClient.get<TranslationNavigationCounts>('/jsa-translations/counts'),
  publishedForJsa: (jsaId: string) =>
    apiClient.get<PublishedTranslationOption[]>(`/jsa-translations/published-for-jsa/${jsaId}`),
  print: (id: string) => apiClient.get<TranslationDetail>(`/jsa-translations/${id}/print`),
};
