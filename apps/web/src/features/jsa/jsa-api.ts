import type { JsaDraftCapabilities,JsaDraftDetail,JsaValidationResult,MasterDataRecord,OrganizationOption,RiskMatrixVersionDetail } from '@jsams/shared-types';
import { apiClient } from '../../services/api-client';
export const jsaApi={
  capabilities:()=>apiClient.get<JsaDraftCapabilities>('/jsa-drafts/capabilities'),
  options:<T=MasterDataRecord>(kind:string,query='')=>apiClient.get<T[]>(`/jsa-drafts/options/${kind}${query}`),
  matrix:(rigId:string)=>apiClient.get<RiskMatrixVersionDetail>(`/jsa-drafts/effective-matrix/${rigId}`),
  create:(body:Record<string,string>)=>apiClient.post<JsaDraftDetail>('/jsa-drafts',body),
  detail:(id:string)=>apiClient.get<JsaDraftDetail>(`/jsa-drafts/${id}`),
  header:(id:string,body:unknown)=>apiClient.put<JsaDraftDetail>(`/jsa-drafts/${id}`,body),
  content:(id:string,body:unknown)=>apiClient.put<JsaDraftDetail>(`/jsa-drafts/${id}/content`,body),
  validate:(id:string)=>apiClient.post<JsaValidationResult>(`/jsa-drafts/${id}/validate`,{}),
  cancel:(id:string,body:unknown)=>apiClient.post<{status:string}>(`/jsa-drafts/${id}/cancel`,body),
};
export type { OrganizationOption };
