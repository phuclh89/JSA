import type {
  MatrixCompletenessResult,
  RigMatrixAssignment,
  RiskMatrixSummary,
  RiskMatrixVersionDetail,
} from '@jsams/shared-types';

export interface MatrixInput {
  code: string;
  name: string;
  dimension: 3 | 5;
  description?: string;
  rowVersion?: string;
}

export interface VersionInput {
  versionCode: string;
  description?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  rowVersion?: string;
}

export interface AxisInput {
  ref: string;
  code: string;
  label: string;
  numericValue: number | null;
  displayOrder: number;
  definition: string;
  peopleDefinition?: string;
  assetDefinition?: string;
  environmentDefinition?: string;
  active?: boolean;
}

export interface ResultInput {
  ref: string;
  code: string;
  name: string;
  description?: string;
  semanticCategory?: string;
  displayOrder: number;
  displayColor?: string;
  guidanceText?: string;
  prohibited?: boolean;
  active?: boolean;
}

export interface CellInput {
  ref: string;
  likelihoodRef: string;
  severityRef: string;
  riskResultRef: string;
  ratingCode: string | null;
  ratingValue: number | null;
  displayColor?: string;
  guidanceText?: string;
  active?: boolean;
}

export interface MatrixConfigurationInput {
  rowVersion: string;
  likelihoods: AxisInput[];
  severities: AxisInput[];
  results: ResultInput[];
  cells: CellInput[];
}

export interface AssignmentInput {
  rigId: string;
  matrixVersionId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  reason: string;
  rowVersion?: string;
}

export interface RigLockRecord {
  rigId: string;
  siteId: string;
  active: boolean;
}

export interface MatrixListResult {
  items: RiskMatrixSummary[];
  total: number;
}
export interface AssignmentListResult {
  items: RigMatrixAssignment[];
  total: number;
}
export type { MatrixCompletenessResult, RiskMatrixVersionDetail };
