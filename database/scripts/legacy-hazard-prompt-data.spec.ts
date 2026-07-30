import { describe, expect, it } from 'vitest';
import { legacyHazardPrompts } from './legacy-hazard-prompt-data.js';

describe('PV Drilling legacy Hazard Assessment Prompt seed', () => {
  it('contains all 25 prompts in the confirmed visual order', () => {
    expect(legacyHazardPrompts).toHaveLength(25);
    expect(legacyHazardPrompts.map((item) => item.label)).toEqual([
      'Hard hat',
      'Disposable coverall',
      'Use of ladder',
      'MSDS',
      'Well control procedures agreed',
      'Gloves (heat resistant/other)',
      'Safety goggles',
      'Fall protection/ Safety Harness',
      'Gas test',
      'Third party involved',
      'Impact Glove',
      'Safety shields',
      'Signs/barriers',
      'Rescue plan required',
      'Fire-fighting equipment',
      'Safety boots/shoe (rubber)',
      'Hearing protection',
      'Environment Hazards Reviewed',
      'Simultaneous operations (SIMOPS)',
      'Isolations required',
      'Safety glasses',
      'Dust mask',
      'Weather reports discussed',
      'Communication (Radio/Banksman)',
      'Lifejacket/Work Vest',
    ]);
  });

  it('uses unique stable codes', () => {
    expect(new Set(legacyHazardPrompts.map((item) => item.code)).size).toBe(25);
    expect(legacyHazardPrompts.every((item) => item.code.length <= 50)).toBe(true);
  });
});
