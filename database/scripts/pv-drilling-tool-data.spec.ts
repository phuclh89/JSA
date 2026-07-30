import { describe, expect, it } from 'vitest';
import {
  pvDrillingToolCategory,
  pvDrillingTools,
  pvDrillingToolScope,
} from './pv-drilling-tool-data.js';

describe('PV Drilling Tool seed', () => {
  it('contains the exact confirmed Tool names in display order', () => {
    expect(pvDrillingTools.map((tool) => tool.name)).toEqual([
      'Hard Hat',
      'Impact Gloves',
      'Gloves other (Chemical/Weld/Mech/Elect)',
      'Safety Boots / Shoes',
      'Safety Glasses',
      'Disposable Coveralls',
      'Hearing Protection',
      'Chemical Apron',
      'Respirator/Dust Mask',
      'Disposable Coverall',
      'Safety Goggles',
      'Face Shield',
      'Use of Ladder',
      'Lanyarded Tools (DO Tools f/ height)',
      'Safety Harness / Riding Belt',
      'Inertia Reel',
      'Rescue Tripod',
      'BA Set',
      'Signs / Barriers',
      'MSDS',
      'Gas Test',
      'Rescue Plan required',
      'SIMOPS',
      'Banksman',
      'Radios',
      '3rd Party Involved',
      'Fire Extinguisher /Hose',
      'Isolations Required',
      'Lifejacket',
      'Work Vest',
      'Fluke Meter (Elect tester)',
      'Weather Reports Discussed',
      'Environment Hazards Reviewed',
      'Ventilation required',
      'Standby Boat required',
      'Radio Silence required',
      'Rig Announcement required',
      'Standby man / Fire watch',
      'Air tools',
      'Hand tools',
      'Lifting Equipment',
      'Slings',
      'Shackles',
      'Chain Hoists',
      'Lever Hoists',
      'Push/Pull Sticks',
      'Crane Pennants',
      'Safety hang off pennants',
      'Tag Lines',
      'Roller Rescue',
      'Rescue Inertia Reel',
      'Rescue Reel/Rescue Tripod',
      'Knife',
    ]);
  });

  it('uses one Global category and unique stable Tool codes', () => {
    expect(pvDrillingToolScope).toBe('GLOBAL');
    expect(pvDrillingToolCategory).toEqual({ code: 'JSA_TOOLS', name: 'JSA Tools' });
    expect(pvDrillingTools).toHaveLength(53);
    expect(new Set(pvDrillingTools.map((tool) => tool.code)).size).toBe(53);
    expect(pvDrillingTools.every((tool) => /^[A-Z0-9][A-Z0-9_]*$/.test(tool.code))).toBe(true);
  });
});
