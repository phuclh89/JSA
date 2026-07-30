import { describe, expect, it } from 'vitest';
import { pvDrillingDepartments } from './pv-drilling-department-data.js';

describe('PV Drilling Department seed', () => {
  it('contains the ten confirmed Department names', () => {
    expect(pvDrillingDepartments.map((department) => department.name)).toEqual([
      'Third Party',
      'Drilling',
      'Electrician',
      'Electronics',
      'Mechanic',
      'Marine',
      'Medic',
      'Welder',
      'Catering',
      'STC',
    ]);
  });

  it('uses stable codes suitable for official JSA numbering', () => {
    expect(pvDrillingDepartments.map((department) => department.code)).toEqual([
      '3P',
      'DR',
      'EL',
      'ET',
      'ME',
      'MAR',
      'MED',
      'WE',
      'CAT',
      'STC',
    ]);
  });
});
