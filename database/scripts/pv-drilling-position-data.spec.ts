import { describe, expect, it } from 'vitest';
import { pvDrillingPositions, pvDrillingPositionScope } from './pv-drilling-position-data.js';

describe('PV Drilling Position seed', () => {
  it('contains the exact confirmed Position names in display order', () => {
    expect(pvDrillingPositions.map((position) => position.name)).toEqual([
      'OIM',
      'Senior Toolpusher',
      'Night Toolpusher',
      'Day Toolpusher',
      'Driller',
      'Pumpman',
      'Derrickman',
      'Floorman',
      'Roustabout',
      'Crane Operator',
      'Assistant Crane Operator',
      'Deck Pusher',
      'AB Seaman',
      'Electrician',
      'Mechanic',
      'Chief Electrician',
      'Chief Mechanic',
      'ET',
      'Barge Captain',
      'Assistant Barge Captain',
      'Motorman',
      'STC',
      'Medic',
      'Campboss',
      'Chief Cook',
      'BCO',
      'Scaffolder',
      'Painter',
      'Welder',
      'Third Party',
      'Asst. Driller',
      'HLO',
      'Radio Operator',
      'Store Man',
      'Material Coordinator',
    ]);
  });

  it('uses Global scope and unique stable codes', () => {
    expect(pvDrillingPositionScope).toBe('GLOBAL');
    expect(pvDrillingPositions).toHaveLength(35);
    expect(new Set(pvDrillingPositions.map((position) => position.code)).size).toBe(35);
    expect(
      pvDrillingPositions.every((position) => /^[A-Z0-9][A-Z0-9_]*$/.test(position.code)),
    ).toBe(true);
  });
});
