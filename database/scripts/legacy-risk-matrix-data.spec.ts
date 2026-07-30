import { describe, expect, it } from 'vitest';
import {
  legacyLikelihoods,
  legacyMatrixCells,
  legacyRiskResults,
  legacySeverities,
} from './legacy-risk-matrix-data.js';

describe('PV Drilling legacy 5x5 Risk Matrix seed', () => {
  it('contains the confirmed axis terminology and four colour meanings', () => {
    expect(legacyLikelihoods.map((item) => item.definition)).toEqual([
      'Very low / Rare',
      'Low / Unlikely',
      'Possible / Moderate',
      'Hight Likely',
      'Almost Certain',
    ]);
    expect(legacySeverities.map((item) => item.definition)).toEqual([
      'Slight',
      'Minor',
      'Moderate',
      'Major',
      'Catastrophic',
    ]);
    expect(legacyRiskResults.map((item) => item.name)).toEqual([
      'Dark Green',
      'Light Green',
      'Yellow',
      'Red',
    ]);
    expect(legacyRiskResults.find((item) => item.code === 'RED')?.prohibited).toBe(true);
  });

  it('defines all 25 cells with the confirmed legacy ratings', () => {
    expect(Object.values(legacyMatrixCells).flat()).toHaveLength(25);
    expect(legacyMatrixCells['5']?.map((cell) => cell.rating)).toEqual(['M', 'H', 'H', 'E', 'E']);
    expect(legacyMatrixCells['1']?.map((cell) => cell.rating)).toEqual(['L', 'L', 'L', 'L', 'M']);
  });
});
