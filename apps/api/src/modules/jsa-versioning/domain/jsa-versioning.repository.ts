import type { JsaVersionHistoryItem } from '@jsams/shared-types';
import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import type { RevisionMaster, SnapshotEntity } from './jsa-versioning.types';

export const JSA_VERSIONING_REPOSITORY = Symbol('JSA_VERSIONING_REPOSITORY');

export interface CheckoutResult {
  jsaId: string;
  baseVersionId: string;
  workingVersionId: string;
  matrixChanged: boolean;
}

export interface JsaVersioningRepository {
  master(
    context: OracleTransactionContext,
    jsaId: string,
    lock?: boolean,
  ): Promise<RevisionMaster | undefined>;
  checkout(
    context: OracleTransactionContext,
    master: RevisionMaster,
    user: { userId: string; username: string; displayName: string },
  ): Promise<CheckoutResult>;
  undo(context: OracleTransactionContext, master: RevisionMaster, actor: string): Promise<void>;
  hasPendingTask(context: OracleTransactionContext, workingVersionId: string): Promise<boolean>;
  snapshots(
    context: OracleTransactionContext,
    jsaId: string,
    versionId: string,
  ): Promise<SnapshotEntity[]>;
  history(
    context: OracleTransactionContext,
    jsaId: string,
  ): Promise<JsaVersionHistoryItem[]>;
}

