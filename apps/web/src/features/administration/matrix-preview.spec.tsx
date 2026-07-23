import type { RiskMatrixVersionDetail } from '@jsams/shared-types';
import { render, screen, within } from '@testing-library/react';

import { MatrixPreview } from './matrix-preview';

function mixedVersion(): RiskMatrixVersionDetail {
  const likelihoods = ['1', '2', '3', '4', '5'].map((code, index) => ({
    id: `L${code}`,
    code,
    label: `Likelihood ${code}`,
    numericValue: index + 1,
    displayOrder: index + 1,
    definition: `Definition ${code}`,
    active: true,
    rowVersion: '1',
  }));
  const severities = ['A', 'B', 'C', 'D', 'E'].map((code, index) => ({
    id: `S${code}`,
    code,
    label: `Severity ${code}`,
    numericValue: null,
    displayOrder: index + 1,
    definition: `Definition ${code}`,
    active: true,
    rowVersion: '1',
  }));
  const results = [
    {
      id: 'LOW',
      code: 'LOW',
      name: 'Low Risk',
      displayOrder: 1,
      displayColor: '#e2f6d5',
      prohibited: false,
      active: true,
      rowVersion: '1',
    },
    {
      id: 'EXTREME',
      code: 'EXTREME',
      name: 'Extreme Risk',
      displayOrder: 2,
      displayColor: '#d03238',
      guidanceText: 'Configured guidance',
      prohibited: true,
      active: true,
      rowVersion: '1',
    },
  ];
  const cells = likelihoods.flatMap((likelihood) =>
    severities.map((severity) => {
      const extreme = likelihood.code === '5' && ['D', 'E'].includes(severity.code);
      return {
        id: `${likelihood.id}-${severity.id}`,
        likelihoodId: likelihood.id,
        severityId: severity.id,
        ratingCode: extreme ? 'E' : 'L',
        ratingValue: null,
        riskResultId: extreme ? 'EXTREME' : 'LOW',
        riskResultCode: extreme ? 'EXTREME' : 'LOW',
        riskResultName: extreme ? 'Extreme Risk' : 'Low Risk',
        displayColor: extreme ? '#d03238' : '#e2f6d5',
        active: true,
        rowVersion: '1',
      };
    }),
  );

  return {
    id: '100',
    matrixId: '10',
    matrixCode: 'TEST_5X5',
    matrixName: 'Test-only mixed Matrix',
    dimension: 5,
    versionCode: 'V1',
    active: true,
    immutable: false,
    rowVersion: '1',
    likelihoods,
    severities,
    results,
    cells,
    completeness: {
      complete: true,
      expectedCellCount: 25,
      actualCellCount: 25,
      missingCells: [],
      errors: [],
    },
  };
}

describe('MatrixPreview', () => {
  it('renders mixed codes and configured results without a calculated score', () => {
    render(<MatrixPreview version={mixedVersion()} />);
    const table = screen.getByRole('table');
    const rowHeader = within(table).getByRole('rowheader', { name: /5 Likelihood 5/ });
    expect(rowHeader).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: /E Severity E/ })).toBeInTheDocument();
    const row = rowHeader.closest('tr')!;
    expect(within(row).getAllByText('Rating E').length).toBeGreaterThan(0);
    expect(within(row).getAllByText(/Extreme Risk \(EXTREME\)/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/5\s*[x*]\s*[DE]/i)).not.toBeInTheDocument();
    expect(screen.getByText('Configured guidance')).toBeInTheDocument();
  });

  it('shows incomplete state and missing configuration explicitly', () => {
    const version = mixedVersion();
    version.cells = version.cells.slice(0, 24);
    version.completeness = {
      complete: false,
      expectedCellCount: 25,
      actualCellCount: 24,
      missingCells: [
        { likelihoodId: 'L5', likelihoodCode: '5', severityId: 'SE', severityCode: 'E' },
      ],
      errors: [{ code: 'MATRIX_CELL_MISSING', message: 'Missing' }],
    };
    render(<MatrixPreview version={version} />);
    expect(screen.getByText('Matrix Version is incomplete')).toBeInTheDocument();
    expect(screen.getByText('Missing configuration')).toBeInTheDocument();
  });
});
