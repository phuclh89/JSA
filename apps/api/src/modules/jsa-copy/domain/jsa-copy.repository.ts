import type {
  JsaCopyDestinationOptions,
  JsaCopyProvenance,
  JsaCopyResult,
} from '@jsams/shared-types';
import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import type {
  CopyAggregate,
  CopyDestinationResolution,
  CopyExecutionPlan,
  CopyRequestIdentity,
  CopySourceRecord,
  ExistingCopyRequest,
} from './jsa-copy.types';

export const JSA_COPY_REPOSITORY = Symbol('JSA_COPY_REPOSITORY');

export interface JsaCopyRepository {
  source(
    context: OracleTransactionContext,
    jsaId: string,
    lock?: boolean,
  ): Promise<CopySourceRecord | undefined>;
  destinationResolution(
    context: OracleTransactionContext,
    siteId: string,
    rigId: string,
    departmentId: string,
  ): Promise<CopyDestinationResolution>;
  aggregate(
    context: OracleTransactionContext,
    sourceVersionId: string,
    sourceMatrixId?: string,
  ): Promise<CopyAggregate>;
  destinationOptions(
    context: OracleTransactionContext,
    localSiteId: string,
  ): Promise<JsaCopyDestinationOptions | undefined>;
  existingRequest(
    context: OracleTransactionContext,
    userId: string,
    requestKey: string,
  ): Promise<ExistingCopyRequest | undefined>;
  createCopy(
    context: OracleTransactionContext,
    plan: CopyExecutionPlan,
    number: { number: string; scopeKey: string },
    request: CopyRequestIdentity,
    actor: { userId: string; username: string; displayName: string },
  ): Promise<JsaCopyResult>;
  provenance(
    context: OracleTransactionContext,
    destinationJsaId: string,
  ): Promise<JsaCopyProvenance | undefined>;
}
