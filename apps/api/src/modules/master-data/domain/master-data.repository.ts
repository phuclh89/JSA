import type { MasterDataKind, MasterDataRecord, OrganizationOption } from '@jsams/shared-types';
import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import type { MasterDataInput, MasterDataListQuery, MasterDataPage } from './master-data.types';

export const MASTER_DATA_REPOSITORY = Symbol('MASTER_DATA_REPOSITORY');

export interface MasterDataRepository {
  listScopeOptions(
    context: OracleTransactionContext,
    type: 'SITE' | 'RIG' | 'DEPARTMENT',
    siteId?: string,
    rigId?: string,
  ): Promise<OrganizationOption[]>;
  list(
    context: OracleTransactionContext,
    kind: MasterDataKind,
    query: MasterDataListQuery,
  ): Promise<MasterDataPage>;
  findById(
    context: OracleTransactionContext,
    kind: MasterDataKind,
    id: string,
  ): Promise<MasterDataRecord | undefined>;
  validateScope(
    context: OracleTransactionContext,
    scope: Pick<MasterDataInput, 'scopeType' | 'siteId' | 'rigId' | 'departmentId'>,
  ): Promise<boolean>;
  isToolCategoryActive(context: OracleTransactionContext, categoryId: string): Promise<boolean>;
  create(
    context: OracleTransactionContext,
    kind: MasterDataKind,
    input: MasterDataInput,
    actor: string,
  ): Promise<MasterDataRecord>;
  update(
    context: OracleTransactionContext,
    kind: MasterDataKind,
    id: string,
    input: MasterDataInput,
    rowVersion: string,
    actor: string,
  ): Promise<MasterDataRecord | undefined>;
  setActive(
    context: OracleTransactionContext,
    kind: MasterDataKind,
    id: string,
    active: boolean,
    rowVersion: string,
    actor: string,
  ): Promise<MasterDataRecord | undefined>;
}
