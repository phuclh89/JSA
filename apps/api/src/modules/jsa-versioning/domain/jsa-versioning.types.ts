export interface RevisionMaster {
  jsaId: string;
  jsaNumber: string;
  siteId: string;
  rigId: string;
  departmentId: string;
  currentVersionId?: string;
  workingVersionId?: string;
  currentStatus?: string;
  workingStatus?: string;
  baseVersionId?: string;
  checkedOutByUserId?: string;
  matrixVersionId?: string;
}

export interface SnapshotEntity {
  entityType: string;
  logicalKey: string;
  label: string;
  position: string;
  values: Record<string, string | number | boolean | null>;
}

