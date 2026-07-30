import { describe, expect, it } from 'vitest';
import { pvDrillingRigMatrixAssignments } from './pv-drilling-rig-matrix-assignment-data.js';

describe('PV Drilling Rig Matrix assignments', () => {
  it('assigns the confirmed 5x5 Matrix only to PVD-V', () => {
    expect(pvDrillingRigMatrixAssignments.filter((item) => item.matrixCode === 'DEV-5X5')).toEqual([
      { rigCode: 'PVD-V', matrixCode: 'DEV-5X5', versionCode: 'PVDRILLING-V2' },
    ]);
  });

  it('assigns the confirmed 3x3 Matrix to every other Rig', () => {
    expect(
      pvDrillingRigMatrixAssignments
        .filter((item) => item.matrixCode === 'PVD-3X3')
        .map((item) => item.rigCode),
    ).toEqual(['PVD-I', 'PVD-II', 'PVD-III', 'PVD-VI', 'PVD-VIII', 'PVD-IX', 'PVD-X', 'SHOREBASE']);
  });
});
