import type { JsaDraftAttachment,JsaDraftBasicStep,JsaDraftHeader,JsaDraftProcedureReference,JsaDraftPrompt,JsaDraftTask,JsaPromptCoverage } from '@jsams/shared-types';
import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import type { CreateDraftInput,DraftAccessRecord,RiskSnapshot,SaveDraftContentInput,UpdateDraftHeaderInput } from './jsa-draft.types';
export const JSA_DRAFT_REPOSITORY=Symbol('JSA_DRAFT_REPOSITORY');
export interface DraftLoadRecord {header:JsaDraftHeader;prompts:JsaDraftPrompt[];tasks:JsaDraftTask[];coverage:JsaPromptCoverage[];steps:JsaDraftBasicStep[];procedures:JsaDraftProcedureReference[];attachments:JsaDraftAttachment[];}
export interface JsaDraftRepository {
  validateCreate(context:OracleTransactionContext,input:CreateDraftInput):Promise<{matrixVersionId:string}>;
  create(context:OracleTransactionContext,input:CreateDraftInput,matrixVersionId:string,number:{number:string;scopeKey:string},userId:string,actor:string):Promise<string>;
  access(context:OracleTransactionContext,jsaId:string,lock?:boolean):Promise<DraftAccessRecord|undefined>;
  updateHeader(context:OracleTransactionContext,access:DraftAccessRecord,input:UpdateDraftHeaderInput,actor:string):Promise<void>;
  resolveRisk(context:OracleTransactionContext,matrixVersionId:string,input:{likelihoodId?:string;severityId?:string}):Promise<RiskSnapshot|undefined>;
  saveContent(context:OracleTransactionContext,access:DraftAccessRecord,input:SaveDraftContentInput,actor:string):Promise<void>;
  cancel(context:OracleTransactionContext,access:DraftAccessRecord,rowVersion:string,versionRowVersion:string,actor:string):Promise<void>;
  load(context:OracleTransactionContext,jsaId:string):Promise<DraftLoadRecord|undefined>;
}
