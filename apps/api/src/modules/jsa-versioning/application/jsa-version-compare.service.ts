import { Injectable } from '@nestjs/common';
import type {
  JsaChangeType,
  JsaFieldChange,
  JsaVersionChange,
  JsaVersionCompare,
} from '@jsams/shared-types';
import type { SnapshotEntity } from '../domain/jsa-versioning.types';

@Injectable()
export class JsaVersionCompareService {
  compare(
    jsaId: string,
    baseVersionId: string,
    workingVersionId: string,
    base: SnapshotEntity[],
    working: SnapshotEntity[],
  ): JsaVersionCompare {
    const key = (entity: SnapshotEntity) => `${entity.entityType}:${entity.logicalKey}`;
    const baseMap = new Map(base.map((entity) => [key(entity), entity]));
    const workingMap = new Map(working.map((entity) => [key(entity), entity]));
    const keys = [...new Set([...baseMap.keys(), ...workingMap.keys()])].sort();
    const changes: JsaVersionChange[] = keys.map((itemKey) => {
      const oldEntity = baseMap.get(itemKey);
      const newEntity = workingMap.get(itemKey);
      if (!oldEntity)
        return this.change(newEntity!, 'ADDED', [], undefined, newEntity!.position);
      if (!newEntity)
        return this.change(
          oldEntity,
          'DELETED',
          Object.entries(oldEntity.values)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([field, oldValue]) => ({ field, oldValue: oldValue ?? null, newValue: null })),
          oldEntity.position,
          undefined,
        );
      const fields = this.fields(oldEntity.values, newEntity.values);
      const moved = oldEntity.position !== newEntity.position;
      const type: JsaChangeType = fields.length ? 'MODIFIED' : moved ? 'MOVED' : 'UNCHANGED';
      return this.change(
        newEntity,
        type,
        fields,
        moved ? oldEntity.position : undefined,
        moved ? newEntity.position : undefined,
      );
    });
    const summary: Record<JsaChangeType, number> = {
      ADDED: 0,
      MODIFIED: 0,
      DELETED: 0,
      MOVED: 0,
      UNCHANGED: 0,
    };
    for (const change of changes) summary[change.changeType] += 1;
    return { jsaId, baseVersionId, workingVersionId, summary, changes };
  }

  private fields(
    oldValues: SnapshotEntity['values'],
    newValues: SnapshotEntity['values'],
  ): JsaFieldChange[] {
    return [...new Set([...Object.keys(oldValues), ...Object.keys(newValues)])]
      .sort()
      .filter((field) => oldValues[field] !== newValues[field])
      .map((field) => ({
        field,
        oldValue: oldValues[field] ?? null,
        newValue: newValues[field] ?? null,
      }));
  }

  private change(
    entity: SnapshotEntity,
    changeType: JsaChangeType,
    fields: JsaFieldChange[],
    oldPosition?: string,
    newPosition?: string,
  ): JsaVersionChange {
    return {
      entityType: entity.entityType,
      logicalKey: entity.logicalKey,
      changeType,
      label: entity.label,
      fields,
      ...(oldPosition !== undefined ? { oldPosition } : {}),
      ...(newPosition !== undefined ? { newPosition } : {}),
    };
  }
}
