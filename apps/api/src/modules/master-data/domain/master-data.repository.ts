import type {
  MasterDataKind,
  MasterDataRecord,
  OrganizationKind,
  OrganizationOption,
  OrganizationRecord,
} from '@jsams/shared-types';
import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import type {
  MasterDataInput,
  MasterDataListQuery,
  MasterDataPage,
  OrganizationInput,
  OrganizationPage,
} from './master-data.types';

export const MASTER_DATA_REPOSITORY = Symbol('MASTER_DATA_REPOSITORY');

export interface MasterDataRepository {
  listScopeOptions(
    context: OracleTransactionContext,
    type: 'SITE' | 'RIG' | 'DEPARTMENT',
    siteId?: string,
    rigId?: string,
  ): Promise<OrganizationOption[]>;
  listOrganizations(
    context: OracleTransactionContext,
    kind: OrganizationKind,
    query: MasterDataListQuery,
  ): Promise<OrganizationPage>;
  findOrganizationById(
    context: OracleTransactionContext,
    kind: OrganizationKind,
    id: string,
  ): Promise<OrganizationRecord | undefined>;
  validateOrganizationParent(
    context: OracleTransactionContext,
    kind: OrganizationKind,
    input: OrganizationInput,
  ): Promise<boolean>;
  createOrganization(
    context: OracleTransactionContext,
    kind: OrganizationKind,
    input: OrganizationInput,
    actor: string,
  ): Promise<OrganizationRecord>;
  updateOrganization(
    context: OracleTransactionContext,
    kind: OrganizationKind,
    id: string,
    input: OrganizationInput,
    rowVersion: string,
    actor: string,
  ): Promise<OrganizationRecord | undefined>;
  setOrganizationActive(
    context: OracleTransactionContext,
    kind: OrganizationKind,
    id: string,
    active: boolean,
    rowVersion: string,
    actor: string,
  ): Promise<OrganizationRecord | undefined>;
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
