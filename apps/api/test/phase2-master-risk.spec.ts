import {
  validateMatrixConfiguration,
  resolveConfiguredCell,
} from '../src/modules/risk-matrix/domain/matrix-completeness';
import type {
  AxisInput,
  CellInput,
  ResultInput,
} from '../src/modules/risk-matrix/domain/risk-matrix.types';
import { validateSystemParameter } from '../src/modules/master-data/domain/system-parameter-validation';

function fixture() {
  const likelihoods: AxisInput[] = ['1', '2', '3', '4', '5'].map((code, index) => ({
    ref: `L${code}`,
    code,
    label: `Likelihood ${code}`,
    numericValue: index + 1,
    displayOrder: index + 1,
    definition: `Definition ${code}`,
  }));
  const severities: AxisInput[] = ['A', 'B', 'C', 'D', 'E'].map((code, index) => ({
    ref: `S${code}`,
    code,
    label: `Severity ${code}`,
    numericValue: null,
    displayOrder: index + 1,
    definition: `Definition ${code}`,
  }));
  const results: ResultInput[] = [
    ['LOW', 'Low'],
    ['MEDIUM', 'Medium'],
    ['HIGH', 'High'],
    ['EXTREME', 'Extreme'],
  ].map(([code, name], index) => ({
    ref: `R${code}`,
    code: code!,
    name: name!,
    displayOrder: index + 1,
    displayColor: ['#e2f6d5', '#ffd11a', '#ffc091', '#d03238'][index],
  }));
  const ratings = [
    'L',
    'L',
    'M',
    'M',
    'H',
    'L',
    'M',
    'M',
    'H',
    'H',
    'M',
    'M',
    'H',
    'H',
    'E',
    'M',
    'H',
    'H',
    'E',
    'E',
    'M',
    'H',
    'H',
    'E',
    'E',
  ];
  const resultRef: Record<string, string> = { L: 'RLOW', M: 'RMEDIUM', H: 'RHIGH', E: 'REXTREME' };
  let index = 0;
  const cells: CellInput[] = likelihoods.flatMap((likelihood) =>
    severities.map((severity) => {
      const rating = ratings[index++]!;
      return {
        ref: `${likelihood.ref}-${severity.ref}`,
        likelihoodRef: likelihood.ref,
        severityRef: severity.ref,
        riskResultRef: resultRef[rating]!,
        ratingCode: rating,
        ratingValue: null,
      };
    }),
  );
  return { likelihoods, severities, results, cells };
}

describe('Phase 2 mixed-code Risk Matrix domain', () => {
  it('accepts all 25 configured pairs without numeric calculation', () => {
    const data = fixture();
    const result = validateMatrixConfiguration(
      5,
      data.likelihoods,
      data.severities,
      data.results,
      data.cells,
    );
    expect(result).toEqual(
      expect.objectContaining({
        complete: true,
        expectedCellCount: 25,
        actualCellCount: 25,
        missingCells: [],
      }),
    );
    const lookup = resolveConfiguredCell(
      '5',
      'D',
      data.likelihoods,
      data.severities,
      data.results,
      data.cells,
    );
    expect(lookup?.cell.ratingCode).toBe('E');
    expect(lookup?.cell.ratingValue).toBeNull();
    expect(lookup?.result.code).toBe('EXTREME');
    expect(typeof data.likelihoods[4]?.code).toBe('string');
    expect(data.severities[0]?.code).toBe('A');
  });
  it('keeps Severity E and Rating E in independent namespaces', () => {
    const data = fixture();
    const lookup = resolveConfiguredCell(
      '5',
      'E',
      data.likelihoods,
      data.severities,
      data.results,
      data.cells,
    );
    expect(data.severities[4]?.code).toBe('E');
    expect(lookup?.cell.ratingCode).toBe('E');
    expect(lookup?.result.code).toBe('EXTREME');
  });
  it('uses IDs rather than display order for cell identity', () => {
    const data = fixture();
    const before = resolveConfiguredCell(
      '5',
      'D',
      data.likelihoods,
      data.severities,
      data.results,
      data.cells,
    );
    data.likelihoods[4]!.displayOrder = 1;
    data.likelihoods[0]!.displayOrder = 5;
    const after = resolveConfiguredCell(
      '5',
      'D',
      data.likelihoods,
      data.severities,
      data.results,
      data.cells,
    );
    expect(after?.cell.ref).toBe(before?.cell.ref);
    expect(after?.cell.ratingCode).toBe('E');
  });
  it('reports missing and duplicate combinations', () => {
    const missing = fixture();
    missing.cells.pop();
    expect(
      validateMatrixConfiguration(
        5,
        missing.likelihoods,
        missing.severities,
        missing.results,
        missing.cells,
      ),
    ).toEqual(expect.objectContaining({ complete: false, actualCellCount: 24 }));
    const duplicate = fixture();
    duplicate.cells.push({ ...duplicate.cells[0]!, ref: 'duplicate' });
    expect(
      validateMatrixConfiguration(
        5,
        duplicate.likelihoods,
        duplicate.severities,
        duplicate.results,
        duplicate.cells,
      ).errors,
    ).toContainEqual(expect.objectContaining({ code: 'MATRIX_CELL_DUPLICATE' }));
  });
  it('validates complete 3x3 configuration', () => {
    const likelihoods: AxisInput[] = ['1', '2', '3'].map((code, index) => ({
      ref: `L${code}`,
      code,
      label: code,
      numericValue: null,
      displayOrder: index + 1,
      definition: code,
    }));
    const severities: AxisInput[] = ['A', 'B', 'C'].map((code, index) => ({
      ref: `S${code}`,
      code,
      label: code,
      numericValue: null,
      displayOrder: index + 1,
      definition: code,
    }));
    const results: ResultInput[] = [
      { ref: 'R', code: 'CONFIGURED', name: 'Configured', displayOrder: 1 },
    ];
    const cells = likelihoods.flatMap((l) =>
      severities.map((s) => ({
        ref: `${l.ref}-${s.ref}`,
        likelihoodRef: l.ref,
        severityRef: s.ref,
        riskResultRef: 'R',
        ratingCode: 'Configured',
        ratingValue: null,
      })),
    );
    expect(validateMatrixConfiguration(3, likelihoods, severities, results, cells).complete).toBe(
      true,
    );
  });
});

describe('Phase 2 System Parameter validation', () => {
  it.each([
    ['INTEGER', '12'],
    ['DECIMAL', '12.5'],
    ['BOOLEAN', 'false'],
    ['DATE', '2026-07-22'],
    ['JSON', '{"enabled":true}'],
    ['STRING', 'value'],
  ])('accepts %s values', (type, value) =>
    expect(() => validateSystemParameter('SAFE_PARAMETER', type, value)).not.toThrow(),
  );
  it('rejects invalid typed values and secret keys', () => {
    expect(() => validateSystemParameter('COUNT', 'INTEGER', '1.5')).toThrow('invalid');
    expect(() => validateSystemParameter('CLIENT_SECRET', 'STRING', 'hidden')).toThrow(
      'Secrets are not permitted',
    );
  });
});
