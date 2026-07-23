import type {
  NotificationItem,
  WorkflowDefinitionSummary,
  WorkflowInstanceDetail,
  WorkflowPreview,
  WorkflowQueueItem,
  WorkflowRoleAssignment,
} from '@jsams/shared-types';
import { apiClient } from '../../services/api-client';
export interface WorkflowCapabilities {
  configured: boolean;
  submit: boolean;
  approve: boolean;
  return: boolean;
  reject: boolean;
  comment: boolean;
  view: boolean;
  admin: boolean;
  unavailableReason?: string;
}
export const workflowApi = {
  capabilities: () => apiClient.get<WorkflowCapabilities>('/jsa-workflow/capabilities'),
  preview: (id: string) => apiClient.get<WorkflowPreview>(`/jsa-workflow/${id}/preview`),
  submit: (id: string) => apiClient.post<WorkflowInstanceDetail>(`/jsa-workflow/${id}/submit`, {}),
  detail: (id: string) => apiClient.get<WorkflowInstanceDetail>(`/jsa-workflow/${id}`),
  action: (id: string, action: 'approve' | 'return' | 'reject' | 'comment', comment?: string) =>
    apiClient.post<WorkflowInstanceDetail>(`/jsa-workflow/${id}/${action}`, { comment }),
  queue: (kind: 'approvals' | 'pending' | 'rejected' | 'published') =>
    apiClient.get<WorkflowQueueItem[]>(`/jsa-workflow/queues/${kind}`),
  notifications: () => apiClient.get<NotificationItem[]>('/jsa-workflow/notifications'),
  definitions: () => apiClient.get<WorkflowDefinitionSummary[]>('/jsa-workflow/definitions'),
  saveDefinition: (body: unknown) =>
    apiClient.put<{ id: string }>('/jsa-workflow/definitions', body),
  roleAssignments: () => apiClient.get<WorkflowRoleAssignment[]>('/jsa-workflow/role-assignments'),
  saveRoleAssignment: (body: unknown) =>
    apiClient.put<{ id: string }>('/jsa-workflow/role-assignments', body),
};
