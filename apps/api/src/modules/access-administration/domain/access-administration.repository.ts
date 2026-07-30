import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';

export const ACCESS_ADMINISTRATION_REPOSITORY = Symbol('ACCESS_ADMINISTRATION_REPOSITORY');

export interface PageQuery {
  search?: string;
  active?: boolean;
  offset: number;
  limit: number;
}

export interface AccessAdministrationRepository {
  listUsers(context: OracleTransactionContext, query: PageQuery): Promise<unknown>;
  user(context: OracleTransactionContext, userId: string): Promise<any>;
  registerUser(context: OracleTransactionContext, input: any, actor: any): Promise<string>;
  updateUser(
    context: OracleTransactionContext,
    userId: string,
    input: any,
    actor: any,
  ): Promise<void>;
  setUserActive(
    context: OracleTransactionContext,
    userId: string,
    active: boolean,
    rowVersion: string,
    actor: any,
  ): Promise<void>;
  listRoles(context: OracleTransactionContext, query: PageQuery): Promise<unknown>;
  role(context: OracleTransactionContext, roleId: string): Promise<any>;
  createRole(context: OracleTransactionContext, input: any, actor: any): Promise<string>;
  updateRole(
    context: OracleTransactionContext,
    roleId: string,
    input: any,
    actor: any,
  ): Promise<void>;
  setRoleActive(
    context: OracleTransactionContext,
    roleId: string,
    active: boolean,
    rowVersion: string,
    actor: any,
  ): Promise<void>;
  permissions(context: OracleTransactionContext, group?: string): Promise<unknown[]>;
  userAssignments(
    context: OracleTransactionContext,
    userId: string,
    kind: string,
  ): Promise<unknown[]>;
  roleAssignments(
    context: OracleTransactionContext,
    roleId: string,
    kind: string,
  ): Promise<unknown[]>;
  createAssignment(
    context: OracleTransactionContext,
    kind: string,
    input: any,
    actor: any,
  ): Promise<string>;
  updateAssignment(
    context: OracleTransactionContext,
    kind: string,
    id: string,
    input: any,
    actor: any,
  ): Promise<void>;
  revokeAssignment(
    context: OracleTransactionContext,
    kind: string,
    id: string,
    rowVersion: string,
    actor: any,
  ): Promise<void>;
  pendingImpact(
    context: OracleTransactionContext,
    input: {
      userId?: string;
      roleId?: string;
      permissionId?: string;
      scopeId?: string;
      workflowAssignmentId?: string;
    },
  ): Promise<unknown[]>;
  effectiveAccess(
    context: OracleTransactionContext,
    userId: string,
    effectiveAt?: string,
  ): Promise<any>;
  auditEvents(context: OracleTransactionContext, query: PageQuery): Promise<unknown>;
  auditEvent(context: OracleTransactionContext, id: string): Promise<any>;
}
