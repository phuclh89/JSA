import { JsaVersionCompareService } from '../src/modules/jsa-versioning/application/jsa-version-compare.service';
import type { SnapshotEntity } from '../src/modules/jsa-versioning/domain/jsa-versioning.types';

const entity = (
  entityType: string,
  logicalKey: string,
  position: string,
  values: SnapshotEntity['values'],
): SnapshotEntity => ({
  entityType,
  logicalKey,
  position,
  label: `${entityType} ${logicalKey}`,
  values,
});

describe('JsaVersionCompareService', () => {
  const service = new JsaVersionCompareService();

  it('matches logical keys and deterministically classifies every change type', () => {
    const base = [
      entity('HEADER', 'HEADER', '0', { title: 'Same' }),
      entity('TASK', '1', 'ROOT:1', { title: 'Old' }),
      entity('TASK', '2', 'ROOT:2', { title: 'Moved' }),
      entity('TASK', '3', 'ROOT:3', { title: 'Deleted' }),
    ];
    const working = [
      entity('HEADER', 'HEADER', '0', { title: 'Same' }),
      entity('TASK', '1', 'ROOT:1', { title: 'New' }),
      entity('TASK', '2', 'ROOT:5', { title: 'Moved' }),
      entity('TASK', '4', 'ROOT:4', { title: 'Added' }),
    ];
    const first = service.compare('10', '11', '12', base, working);
    const second = service.compare('10', '11', '12', base, working);

    expect(first).toEqual(second);
    expect(first.summary).toEqual({
      ADDED: 1,
      MODIFIED: 1,
      DELETED: 1,
      MOVED: 1,
      UNCHANGED: 1,
    });
    expect(first.changes.find((change) => change.logicalKey === '1')?.fields).toEqual([
      { field: 'title', oldValue: 'Old', newValue: 'New' },
    ]);
    expect(first.changes.find((change) => change.logicalKey === '2')).toMatchObject({
      changeType: 'MOVED',
      oldPosition: 'ROOT:2',
      newPosition: 'ROOT:5',
    });
    expect(first.changes.find((change) => change.logicalKey === '3')).toMatchObject({
      changeType: 'DELETED',
      fields: [{ field: 'title', oldValue: 'Deleted', newValue: null }],
    });
  });
});
