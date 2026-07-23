import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import type {
  AssignmentInput,
  AssignmentListResult,
  MatrixConfigurationInput,
  MatrixInput,
  MatrixListResult,
  RigLockRecord,
  RiskMatrixVersionDetail,
  VersionInput,
} from './risk-matrix.types';
import type {
  RigMatrixAssignment,
  RiskMatrixSummary,
  RiskMatrixVersionOption,
} from '@jsams/shared-types';

export const RISK_MATRIX_REPOSITORY = Symbol('RISK_MATRIX_REPOSITORY');

export interface RiskMatrixRepository {
  listVersionOptions(
    context: OracleTransactionContext,
    matrixId?: string,
  ): Promise<RiskMatrixVersionOption[]>;
  listMatrices(
    context: OracleTransactionContext,
    keyword?: string,
    active?: boolean,
  ): Promise<MatrixListResult>;
  findMatrix(context: OracleTransactionContext, id: string): Promise<RiskMatrixSummary | undefined>;
  createMatrix(
    context: OracleTransactionContext,
    input: MatrixInput,
    actor: string,
  ): Promise<RiskMatrixSummary>;
  updateMatrix(
    context: OracleTransactionContext,
    id: string,
    input: MatrixInput,
    actor: string,
  ): Promise<RiskMatrixSummary | undefined>;
  setMatrixActive(
    context: OracleTransactionContext,
    id: string,
    active: boolean,
    rowVersion: string,
    actor: string,
  ): Promise<RiskMatrixSummary | undefined>;
  createVersion(
    context: OracleTransactionContext,
    matrixId: string,
    input: VersionInput,
    actor: string,
  ): Promise<RiskMatrixVersionDetail>;
  updateVersion(
    context: OracleTransactionContext,
    id: string,
    input: VersionInput,
    actor: string,
  ): Promise<boolean>;
  loadVersion(
    context: OracleTransactionContext,
    id: string,
  ): Promise<RiskMatrixVersionDetail | undefined>;
  replaceConfiguration(
    context: OracleTransactionContext,
    versionId: string,
    input: MatrixConfigurationInput,
    actor: string,
  ): Promise<boolean>;
  lockVersion(
    context: OracleTransactionContext,
    id: string,
  ): Promise<{ rowVersion: string; immutable: boolean } | undefined>;
  lockRig(context: OracleTransactionContext, rigId: string): Promise<RigLockRecord | undefined>;
  hasOverlap(
    context: OracleTransactionContext,
    input: AssignmentInput,
    excludeId?: string,
  ): Promise<RigMatrixAssignment | undefined>;
  listAssignments(context: OracleTransactionContext, rigId?: string): Promise<AssignmentListResult>;
  createAssignment(
    context: OracleTransactionContext,
    input: AssignmentInput,
    actor: string,
  ): Promise<RigMatrixAssignment>;
  updateAssignment(
    context: OracleTransactionContext,
    id: string,
    input: AssignmentInput,
    actor: string,
  ): Promise<RigMatrixAssignment | undefined>;
  endAssignment(
    context: OracleTransactionContext,
    id: string,
    effectiveTo: string,
    reason: string,
    rowVersion: string,
    actor: string,
  ): Promise<RigMatrixAssignment | undefined>;
  findAssignment(
    context: OracleTransactionContext,
    id: string,
  ): Promise<RigMatrixAssignment | undefined>;
  resolveEffective(
    context: OracleTransactionContext,
    rigId: string,
    effectiveAt: string,
  ): Promise<RigMatrixAssignment[]>;
}
