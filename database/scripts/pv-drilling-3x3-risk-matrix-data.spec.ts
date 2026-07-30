import { describe, expect, it } from 'vitest';
import {
  pvDrilling3x3Likelihoods,
  pvDrilling3x3MatrixCells,
  pvDrilling3x3RiskResults,
  pvDrilling3x3Severities,
} from './pv-drilling-3x3-risk-matrix-data.js';

describe('PV Drilling 3x3 Risk Matrix seed', () => {
  it('contains the supplied likelihood and three-dimension severity definitions', () => {
    expect(pvDrilling3x3Likelihoods).toEqual([
      { code: '1', label: 'LOW', definition: 'Remote' },
      { code: '2', label: 'MED', definition: 'Possible' },
      { code: '3', label: 'HIGH', definition: 'Probable' },
    ]);
    expect(
      pvDrilling3x3Severities.map(
        ({ peopleDefinition, assetDefinition, environmentDefinition }) => [
          peopleDefinition,
          assetDefinition,
          environmentDefinition,
        ],
      ),
    ).toEqual([
      ['No injury', 'No damage', 'No pollution'],
      ['First aid injury', 'Minor damage', 'Minor pollution'],
      ['Lost time injury', 'Major damage', 'Major pollution'],
    ]);
  });

  it('defines the supplied nine scores and result colours', () => {
    expect(
      pvDrilling3x3Likelihoods.flatMap((likelihood) =>
        pvDrilling3x3MatrixCells[likelihood.code]!.map((cell) => cell.rating),
      ),
    ).toEqual(['1', '2', '3', '2', '4', '6', '3', '6', '9']);
    expect(pvDrilling3x3RiskResults.map((result) => result.name)).toEqual([
      'Acceptable',
      'Tolerable',
      'Unacceptable',
    ]);
    expect(
      pvDrilling3x3RiskResults.find((result) => result.code === 'UNACCEPTABLE')?.prohibited,
    ).toBe(true);
  });
});
