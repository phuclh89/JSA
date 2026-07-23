import type { MatrixCompletenessResult } from '@jsams/shared-types';
import type { AxisInput, CellInput, ResultInput } from './risk-matrix.types';

export function validateMatrixConfiguration(
  dimension: number,
  likelihoods: AxisInput[],
  severities: AxisInput[],
  results: ResultInput[],
  cells: CellInput[],
): MatrixCompletenessResult {
  const errors: MatrixCompletenessResult['errors'] = [];
  if (dimension !== 3 && dimension !== 5)
    errors.push({ code: 'MATRIX_DIMENSION_INVALID', message: 'Matrix dimension must be 3 or 5.' });
  const activeLikelihoods = likelihoods.filter((item) => item.active !== false);
  const activeSeverities = severities.filter((item) => item.active !== false);
  const activeResults = new Map(
    results.filter((item) => item.active !== false).map((item) => [item.ref, item]),
  );
  if (activeLikelihoods.length !== dimension)
    errors.push({
      code: 'LIKELIHOOD_COUNT_INVALID',
      message: `Expected ${dimension} active Likelihood levels.`,
    });
  if (activeSeverities.length !== dimension)
    errors.push({
      code: 'SEVERITY_COUNT_INVALID',
      message: `Expected ${dimension} active Severity levels.`,
    });
  for (const [items, prefix] of [
    [activeLikelihoods, 'LIKELIHOOD'],
    [activeSeverities, 'SEVERITY'],
  ] as const) {
    if (hasDuplicate(items.map((item) => item.code.toUpperCase())))
      errors.push({
        code: `${prefix}_CODE_DUPLICATE`,
        message: `${prefix === 'LIKELIHOOD' ? 'Likelihood' : 'Severity'} codes must be unique.`,
      });
    if (hasDuplicate(items.map((item) => item.displayOrder)))
      errors.push({
        code: `${prefix}_ORDER_DUPLICATE`,
        message: `${prefix === 'LIKELIHOOD' ? 'Likelihood' : 'Severity'} display order must be unique.`,
      });
    if (items.some((item) => !item.code.trim() || !item.label.trim() || !item.definition.trim()))
      errors.push({
        code: `${prefix}_REQUIRED_VALUE_MISSING`,
        message: `${prefix === 'LIKELIHOOD' ? 'Likelihood' : 'Severity'} labels and definitions are required.`,
      });
  }
  if (
    hasDuplicate(
      results.filter((item) => item.active !== false).map((item) => item.code.toUpperCase()),
    )
  )
    errors.push({
      code: 'RISK_RESULT_CODE_DUPLICATE',
      message: 'Risk Result codes must be unique.',
    });
  const activeCells = cells.filter((item) => item.active !== false);
  const cellKeys = activeCells.map((item) => `${item.likelihoodRef}:${item.severityRef}`);
  if (hasDuplicate(cellKeys))
    errors.push({
      code: 'MATRIX_CELL_DUPLICATE',
      message: 'A Likelihood and Severity pair may have only one cell.',
    });
  const likelihoodRefs = new Set(activeLikelihoods.map((item) => item.ref));
  const severityRefs = new Set(activeSeverities.map((item) => item.ref));
  if (
    activeCells.some(
      (item) => !likelihoodRefs.has(item.likelihoodRef) || !severityRefs.has(item.severityRef),
    )
  )
    errors.push({
      code: 'MATRIX_CELL_REFERENCE_INVALID',
      message: 'Every cell must reference a level in this Matrix Version.',
    });
  if (activeCells.some((item) => !activeResults.has(item.riskResultRef)))
    errors.push({
      code: 'RISK_RESULT_REFERENCE_INVALID',
      message: 'Every cell must reference an active Risk Result in this Matrix Version.',
    });
  if (activeCells.some((item) => !item.ratingCode?.trim() && item.ratingValue == null))
    errors.push({
      code: 'MATRIX_CELL_RATING_MISSING',
      message: 'Every cell requires a textual or numeric rating representation.',
    });
  const existing = new Set(cellKeys);
  const missingCells = activeLikelihoods.flatMap((likelihood) =>
    activeSeverities
      .filter((severity) => !existing.has(`${likelihood.ref}:${severity.ref}`))
      .map((severity) => ({
        likelihoodId: likelihood.ref,
        likelihoodCode: likelihood.code,
        severityId: severity.ref,
        severityCode: severity.code,
      })),
  );
  if (missingCells.length)
    errors.push({
      code: 'MATRIX_CELL_MISSING',
      message: 'The matrix is missing one or more required combinations.',
    });
  const expectedCellCount = dimension * dimension;
  if (activeCells.length !== expectedCellCount)
    errors.push({
      code: 'MATRIX_CELL_COUNT_INVALID',
      message: `Expected exactly ${expectedCellCount} active Matrix Cells.`,
    });
  return {
    complete: errors.length === 0,
    expectedCellCount,
    actualCellCount: activeCells.length,
    missingCells,
    errors,
  };
}

function hasDuplicate(values: Array<string | number>): boolean {
  return new Set(values).size !== values.length;
}

export function resolveConfiguredCell(
  likelihoodCode: string,
  severityCode: string,
  likelihoods: AxisInput[],
  severities: AxisInput[],
  results: ResultInput[],
  cells: CellInput[],
): { cell: CellInput; result: ResultInput } | undefined {
  const likelihood = likelihoods.find(
    (item) => item.code === likelihoodCode && item.active !== false,
  );
  const severity = severities.find((item) => item.code === severityCode && item.active !== false);
  if (!likelihood || !severity) return undefined;
  const cell = cells.find(
    (item) =>
      item.likelihoodRef === likelihood.ref &&
      item.severityRef === severity.ref &&
      item.active !== false,
  );
  if (!cell) return undefined;
  const result = results.find((item) => item.ref === cell.riskResultRef && item.active !== false);
  return result ? { cell, result } : undefined;
}
