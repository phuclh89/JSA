import { Injectable } from '@nestjs/common';
import oracledb from 'oracledb';
import {
  DuplicateConflictError,
  OptimisticLockError,
  ResourceNotFoundError,
  ValidationError,
} from '../../../common/errors/application-errors';
import { assertOracleId } from '../../../common/oracle/oracle-id';
import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import { correlationContext } from '../../../common/interceptors/correlation-context';
import type {
  AccessAdministrationRepository,
  PageQuery,
} from '../domain/access-administration.repository';

type Row = Record<string, any>;
const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT } as const;
const assignment = {
  'user-role': { table: 'SYS_USER_ROLE', id: 'USER_ROLE_ID', sequence: 'SEQ_SYS_USER_ROLE' },
  'role-permission': {
    table: 'SYS_ROLE_PERMISSION',
    id: 'ROLE_PERMISSION_ID',
    sequence: 'SEQ_SYS_ROLE_PERMISSION',
  },
  override: {
    table: 'SYS_USER_PERMISSION_OVERRIDE',
    id: 'USER_PERMISSION_OVERRIDE_ID',
    sequence: 'SEQ_SYS_USER_PERM_OVERRIDE',
  },
  scope: {
    table: 'SYS_USER_DATA_SCOPE',
    id: 'USER_DATA_SCOPE_ID',
    sequence: 'SEQ_SYS_USER_DATA_SCOPE',
  },
  workflow: {
    table: 'JSA_WF_ROLE_ASSIGNMENT',
    id: 'ROLE_ASSIGNMENT_ID',
    sequence: 'SEQ_JSA_WF_ROLE_ASSIGN',
  },
} as const;

@Injectable()
export class OracleAccessAdministrationRepository implements AccessAdministrationRepository {
  async listUsers(c: OracleTransactionContext, q: PageQuery) {
    const binds = {
      search: q.search ? `%${q.search.toUpperCase()}%` : null,
      active: q.active === undefined ? null : q.active ? 'Y' : 'N',
      offset: q.offset,
      limit: q.limit,
    };
    const rows = await c.connection.execute<Row>(
      `SELECT TO_CHAR(USER_ID) ID,ENTERPRISE_IDENTITY_KEY,USERNAME,DISPLAY_NAME,EMAIL,IS_ACTIVE,
              TO_CHAR(DEFAULT_SITE_ID) DEFAULT_SITE_ID,TO_CHAR(DEFAULT_RIG_ID) DEFAULT_RIG_ID,
              TO_CHAR(DEFAULT_DEPARTMENT_ID) DEFAULT_DEPARTMENT_ID,TO_CHAR(ROW_VERSION) ROW_VERSION
       FROM SYS_USER
       WHERE (:search IS NULL OR UPPER(USERNAME) LIKE :search OR UPPER(DISPLAY_NAME) LIKE :search)
         AND (:active IS NULL OR IS_ACTIVE=:active)
       ORDER BY USERNAME OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      binds,
      opts,
    );
    const count = await c.connection.execute<Row>(
      `SELECT COUNT(*) TOTAL FROM SYS_USER WHERE (:search IS NULL OR UPPER(USERNAME) LIKE :search OR UPPER(DISPLAY_NAME) LIKE :search) AND (:active IS NULL OR IS_ACTIVE=:active)`,
      { search: binds.search, active: binds.active },
      opts,
    );
    return {
      items: rows.rows ?? [],
      total: count.rows?.[0]?.TOTAL ?? 0,
      offset: q.offset,
      limit: q.limit,
    };
  }
  async user(c: OracleTransactionContext, id: string) {
    assertOracleId(id);
    const r = await c.connection.execute<Row>(
      `SELECT TO_CHAR(U.USER_ID) ID,U.ENTERPRISE_IDENTITY_KEY,U.USERNAME,U.DISPLAY_NAME,U.EMAIL,U.IS_ACTIVE,
              TO_CHAR(U.DEFAULT_SITE_ID) DEFAULT_SITE_ID,TO_CHAR(U.DEFAULT_RIG_ID) DEFAULT_RIG_ID,
              TO_CHAR(U.DEFAULT_DEPARTMENT_ID) DEFAULT_DEPARTMENT_ID,TO_CHAR(U.ROW_VERSION) ROW_VERSION,
              U.CREATED_AT,U.CREATED_BY,U.UPDATED_AT,U.UPDATED_BY
       FROM SYS_USER U WHERE U.USER_ID=:id`,
      { id },
      opts,
    );
    if (!r.rows?.[0]) throw new ResourceNotFoundError('Application user was not found');
    return r.rows[0];
  }
  async registerUser(c: OracleTransactionContext, i: any, actor: any) {
    await this.validateDefaults(c, i);
    const id = await this.next(c, 'SEQ_SYS_USER');
    try {
      await c.connection.execute(
        `INSERT INTO SYS_USER(USER_ID,ENTERPRISE_IDENTITY_KEY,USERNAME,DISPLAY_NAME,EMAIL,
          DEFAULT_SITE_ID,DEFAULT_RIG_ID,DEFAULT_DEPARTMENT_ID,IS_ACTIVE,CREATED_SITE_ID,UPDATED_SITE_ID,
          CREATED_BY,UPDATED_BY)
         VALUES(:id,:identity,:username,:displayName,:email,:siteId,:rigId,:departmentId,:active,
                :actorSite,:actorSite,:actorName,:actorName)`,
        {
          id,
          identity: i.enterpriseIdentityKey,
          username: i.username,
          displayName: i.displayName,
          email: i.email ?? null,
          siteId: i.defaultSiteId ?? null,
          rigId: i.defaultRigId ?? null,
          departmentId: i.defaultDepartmentId ?? null,
          active: i.active === false ? 'N' : 'Y',
          actorSite: actor.defaultSiteId,
          actorName: actor.username,
        },
      );
    } catch (e: any) {
      if (e?.errorNum === 1)
        throw new DuplicateConflictError('Identity key or username is already registered');
      throw e;
    }
    await this.audit(c, actor, 'USER_REGISTERED', 'SYS_USER', id, i);
    return id;
  }
  async updateUser(c: OracleTransactionContext, id: string, i: any, actor: any) {
    assertOracleId(id);
    await this.validateDefaults(c, i);
    const before = await this.user(c, id);
    const r = await c.connection.execute(
      `UPDATE SYS_USER SET DISPLAY_NAME=:displayName,EMAIL=:email,DEFAULT_SITE_ID=:siteId,
        DEFAULT_RIG_ID=:rigId,DEFAULT_DEPARTMENT_ID=:departmentId,UPDATED_SITE_ID=:actorSite,
        UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actorName,ROW_VERSION=ROW_VERSION+1
       WHERE USER_ID=:id AND ROW_VERSION=:rowVersion`,
      {
        id,
        displayName: i.displayName,
        email: i.email ?? null,
        siteId: i.defaultSiteId ?? null,
        rigId: i.defaultRigId ?? null,
        departmentId: i.defaultDepartmentId ?? null,
        actorSite: actor.defaultSiteId,
        actorName: actor.username,
        rowVersion: i.rowVersion,
      },
    );
    if (r.rowsAffected !== 1) throw new OptimisticLockError();
    await this.audit(c, actor, 'USER_PROFILE_UPDATED', 'SYS_USER', id, i, before);
  }
  async setUserActive(
    c: OracleTransactionContext,
    id: string,
    active: boolean,
    rowVersion: string,
    actor: any,
  ) {
    assertOracleId(id);
    const before = await this.user(c, id);
    const r = await c.connection.execute(
      `UPDATE SYS_USER SET IS_ACTIVE=:active,UPDATED_SITE_ID=:site,UPDATED_AT=SYSTIMESTAMP,
       UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE USER_ID=:id AND ROW_VERSION=:rowVersion`,
      {
        id,
        active: active ? 'Y' : 'N',
        site: actor.defaultSiteId,
        actor: actor.username,
        rowVersion,
      },
    );
    if (r.rowsAffected !== 1) throw new OptimisticLockError();
    await this.audit(
      c,
      actor,
      active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      'SYS_USER',
      id,
      { active },
      before,
    );
  }
  async listRoles(c: OracleTransactionContext, q: PageQuery) {
    const binds = {
      search: q.search ? `%${q.search.toUpperCase()}%` : null,
      active: q.active === undefined ? null : q.active ? 'Y' : 'N',
      offset: q.offset,
      limit: q.limit,
    };
    const r = await c.connection.execute<Row>(
      `SELECT TO_CHAR(ROLE_ID) ID,ROLE_CODE,ROLE_NAME,DESCRIPTION,IS_SYSTEM_MANAGED,IS_ACTIVE,
              TO_CHAR(ROW_VERSION) ROW_VERSION FROM SYS_ROLE
       WHERE (:search IS NULL OR UPPER(ROLE_CODE) LIKE :search OR UPPER(ROLE_NAME) LIKE :search)
         AND (:active IS NULL OR IS_ACTIVE=:active)
       ORDER BY ROLE_CODE OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      binds,
      opts,
    );
    const n = await c.connection.execute<Row>(
      `SELECT COUNT(*) TOTAL FROM SYS_ROLE WHERE (:search IS NULL OR UPPER(ROLE_CODE) LIKE :search OR UPPER(ROLE_NAME) LIKE :search) AND (:active IS NULL OR IS_ACTIVE=:active)`,
      { search: binds.search, active: binds.active },
      opts,
    );
    return {
      items: r.rows ?? [],
      total: n.rows?.[0]?.TOTAL ?? 0,
      offset: q.offset,
      limit: q.limit,
    };
  }
  async role(c: OracleTransactionContext, id: string) {
    assertOracleId(id);
    const r = await c.connection.execute<Row>(
      `SELECT TO_CHAR(ROLE_ID) ID,ROLE_CODE,ROLE_NAME,DESCRIPTION,IS_SYSTEM_MANAGED,IS_ACTIVE,TO_CHAR(ROW_VERSION) ROW_VERSION,CREATED_AT,CREATED_BY,UPDATED_AT,UPDATED_BY FROM SYS_ROLE WHERE ROLE_ID=:id`,
      { id },
      opts,
    );
    if (!r.rows?.[0]) throw new ResourceNotFoundError('Role was not found');
    return r.rows[0];
  }
  async createRole(c: OracleTransactionContext, i: any, actor: any) {
    const id = await this.next(c, 'SEQ_SYS_ROLE');
    try {
      await c.connection.execute(
        `INSERT INTO SYS_ROLE(ROLE_ID,ROLE_CODE,ROLE_NAME,DESCRIPTION,IS_SYSTEM_MANAGED,CREATED_BY,UPDATED_BY) VALUES(:id,:code,:name,:description,'N',:actor,:actor)`,
        {
          id,
          code: i.roleCode.trim().toUpperCase(),
          name: i.roleName,
          description: i.description ?? null,
          actor: actor.username,
        },
      );
    } catch (e: any) {
      if (e?.errorNum === 1) throw new DuplicateConflictError('Role code already exists');
      throw e;
    }
    await this.audit(c, actor, 'ROLE_CREATED', 'SYS_ROLE', id, i);
    return id;
  }
  async updateRole(c: OracleTransactionContext, id: string, i: any, actor: any) {
    const before = await this.role(c, id);
    if (before.IS_SYSTEM_MANAGED === 'Y')
      throw new ValidationError('System-managed Roles cannot be changed');
    const r = await c.connection.execute(
      `UPDATE SYS_ROLE SET ROLE_NAME=:name,DESCRIPTION=:description,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE ROLE_ID=:id AND ROW_VERSION=:rowVersion`,
      {
        id,
        name: i.roleName,
        description: i.description ?? null,
        actor: actor.username,
        rowVersion: i.rowVersion,
      },
    );
    if (r.rowsAffected !== 1) throw new OptimisticLockError();
    await this.audit(c, actor, 'ROLE_UPDATED', 'SYS_ROLE', id, i, before);
  }
  async setRoleActive(
    c: OracleTransactionContext,
    id: string,
    active: boolean,
    rowVersion: string,
    actor: any,
  ) {
    const before = await this.role(c, id);
    if (before.IS_SYSTEM_MANAGED === 'Y')
      throw new ValidationError('System-managed Roles cannot be activated or deactivated');
    const r = await c.connection.execute(
      `UPDATE SYS_ROLE SET IS_ACTIVE=:active,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE ROLE_ID=:id AND ROW_VERSION=:rowVersion`,
      { id, active: active ? 'Y' : 'N', actor: actor.username, rowVersion },
    );
    if (r.rowsAffected !== 1) throw new OptimisticLockError();
    await this.audit(
      c,
      actor,
      active ? 'ROLE_ACTIVATED' : 'ROLE_DEACTIVATED',
      'SYS_ROLE',
      id,
      { active },
      before,
    );
  }
  async permissions(c: OracleTransactionContext, group?: string) {
    const r = await c.connection.execute<Row>(
      `SELECT TO_CHAR(P.PERMISSION_ID) ID,P.PERMISSION_CODE,P.PERMISSION_NAME,P.DESCRIPTION,
              P.PERMISSION_GROUP,P.IS_ACTIVE,
              LISTAGG(R.ROLE_CODE,',') WITHIN GROUP(ORDER BY R.ROLE_CODE) ROLE_CODES
       FROM SYS_PERMISSION P LEFT JOIN SYS_ROLE_PERMISSION RP ON RP.PERMISSION_ID=P.PERMISSION_ID AND RP.IS_ACTIVE='Y'
       LEFT JOIN SYS_ROLE R ON R.ROLE_ID=RP.ROLE_ID AND R.IS_ACTIVE='Y'
       WHERE (:groupCode IS NULL OR P.PERMISSION_GROUP=:groupCode)
       GROUP BY P.PERMISSION_ID,P.PERMISSION_CODE,P.PERMISSION_NAME,P.DESCRIPTION,P.PERMISSION_GROUP,P.IS_ACTIVE
       ORDER BY P.PERMISSION_GROUP,P.PERMISSION_CODE`,
      { groupCode: group ?? null },
      opts,
    );
    return r.rows ?? [];
  }
  async userAssignments(c: OracleTransactionContext, userId: string, kind: string) {
    assertOracleId(userId);
    const sql: Record<string, string> = {
      roles: `SELECT TO_CHAR(UR.USER_ROLE_ID) ID,TO_CHAR(UR.ROLE_ID) ROLE_ID,R.ROLE_CODE,R.ROLE_NAME,UR.IS_ACTIVE,UR.ASSIGNED_AT,UR.REVOKED_AT,UR.CREATED_BY,TO_CHAR(UR.ROW_VERSION) ROW_VERSION FROM SYS_USER_ROLE UR JOIN SYS_ROLE R ON R.ROLE_ID=UR.ROLE_ID WHERE UR.USER_ID=:id ORDER BY UR.ASSIGNED_AT DESC`,
      overrides: `SELECT TO_CHAR(O.USER_PERMISSION_OVERRIDE_ID) ID,TO_CHAR(O.PERMISSION_ID) PERMISSION_ID,P.PERMISSION_CODE,O.EFFECT_CODE,O.REASON_TEXT,O.EFFECTIVE_FROM,O.EFFECTIVE_TO,O.IS_ACTIVE,TO_CHAR(O.ROW_VERSION) ROW_VERSION FROM SYS_USER_PERMISSION_OVERRIDE O JOIN SYS_PERMISSION P ON P.PERMISSION_ID=O.PERMISSION_ID WHERE O.USER_ID=:id ORDER BY O.CREATED_AT DESC`,
      scopes: `SELECT TO_CHAR(S.USER_DATA_SCOPE_ID) ID,S.SCOPE_TYPE,TO_CHAR(S.SITE_ID) SITE_ID,TO_CHAR(S.RIG_ID) RIG_ID,TO_CHAR(S.DEPARTMENT_ID) DEPARTMENT_ID,S.CAN_VIEW,S.CAN_ACT,S.EFFECTIVE_FROM,S.EFFECTIVE_TO,S.IS_ACTIVE,TO_CHAR(S.ROW_VERSION) ROW_VERSION FROM SYS_USER_DATA_SCOPE S WHERE S.USER_ID=:id ORDER BY S.CREATED_AT DESC`,
      workflow: `SELECT TO_CHAR(A.ROLE_ASSIGNMENT_ID) ID,A.WORKFLOW_ROLE_CODE,TO_CHAR(A.SITE_ID) SITE_ID,TO_CHAR(A.RIG_ID) RIG_ID,TO_CHAR(A.DEPARTMENT_ID) DEPARTMENT_ID,A.EFFECTIVE_FROM,A.EFFECTIVE_TO,A.IS_ACTIVE,TO_CHAR(A.ROW_VERSION) ROW_VERSION FROM JSA_WF_ROLE_ASSIGNMENT A WHERE A.USER_ID=:id ORDER BY A.CREATED_AT DESC`,
    };
    if (!sql[kind]) throw new ValidationError('Unsupported assignment view');
    const r = await c.connection.execute<Row>(sql[kind]!, { id: userId }, opts);
    return r.rows ?? [];
  }
  async roleAssignments(c: OracleTransactionContext, roleId: string, kind: string) {
    assertOracleId(roleId);
    const sql =
      kind === 'permissions'
        ? `SELECT TO_CHAR(RP.ROLE_PERMISSION_ID) ID,TO_CHAR(P.PERMISSION_ID) PERMISSION_ID,P.PERMISSION_CODE,P.PERMISSION_NAME,RP.IS_ACTIVE,RP.ASSIGNED_AT,RP.REVOKED_AT,TO_CHAR(RP.ROW_VERSION) ROW_VERSION FROM SYS_ROLE_PERMISSION RP JOIN SYS_PERMISSION P ON P.PERMISSION_ID=RP.PERMISSION_ID WHERE RP.ROLE_ID=:id ORDER BY P.PERMISSION_CODE`
        : `SELECT TO_CHAR(UR.USER_ROLE_ID) ID,TO_CHAR(U.USER_ID) USER_ID,U.USERNAME,U.DISPLAY_NAME,UR.IS_ACTIVE,UR.ASSIGNED_AT,UR.REVOKED_AT,TO_CHAR(UR.ROW_VERSION) ROW_VERSION FROM SYS_USER_ROLE UR JOIN SYS_USER U ON U.USER_ID=UR.USER_ID WHERE UR.ROLE_ID=:id ORDER BY U.USERNAME`;
    const r = await c.connection.execute<Row>(sql, { id: roleId }, opts);
    return r.rows ?? [];
  }
  async createAssignment(c: OracleTransactionContext, kind: string, i: any, actor: any) {
    const meta = assignment[kind as keyof typeof assignment];
    if (!meta) throw new ValidationError('Unsupported assignment type');
    const id = await this.next(c, meta.sequence);
    const effectiveFrom = i.effectiveFrom ? new Date(i.effectiveFrom) : new Date();
    const effectiveTo = i.effectiveTo ? new Date(i.effectiveTo) : null;
    if (effectiveTo && effectiveTo <= effectiveFrom)
      throw new ValidationError('Effective To must be later than Effective From');
    if (kind === 'override' && i.effect === 'DENY' && !i.reason?.trim())
      throw new ValidationError('A reason is required for DENY');
    if (kind === 'scope' && i.canAct && !i.canView)
      throw new ValidationError('CAN_ACT requires CAN_VIEW');
    if (kind === 'scope' || kind === 'workflow')
      await this.validateHierarchy(c, i.siteId, i.rigId, i.departmentId);
    const sql: Record<string, [string, any]> = {
      'user-role': [
        `INSERT INTO SYS_USER_ROLE(USER_ROLE_ID,USER_ID,ROLE_ID,CREATED_BY,UPDATED_BY) SELECT :id,U.USER_ID,R.ROLE_ID,:actor,:actor FROM SYS_USER U CROSS JOIN SYS_ROLE R WHERE U.USER_ID=:userId AND U.IS_ACTIVE='Y' AND R.ROLE_ID=:roleId AND R.IS_ACTIVE='Y'`,
        { id, userId: i.userId, roleId: i.roleId, actor: actor.username },
      ],
      'role-permission': [
        `INSERT INTO SYS_ROLE_PERMISSION(ROLE_PERMISSION_ID,ROLE_ID,PERMISSION_ID,CREATED_BY,UPDATED_BY) SELECT :id,R.ROLE_ID,P.PERMISSION_ID,:actor,:actor FROM SYS_ROLE R CROSS JOIN SYS_PERMISSION P WHERE R.ROLE_ID=:roleId AND R.IS_ACTIVE='Y' AND P.PERMISSION_ID=:permissionId AND P.IS_ACTIVE='Y'`,
        { id, roleId: i.roleId, permissionId: i.permissionId, actor: actor.username },
      ],
      override: [
        `INSERT INTO SYS_USER_PERMISSION_OVERRIDE(USER_PERMISSION_OVERRIDE_ID,USER_ID,PERMISSION_ID,EFFECT_CODE,REASON_TEXT,EFFECTIVE_FROM,EFFECTIVE_TO,CREATED_BY,UPDATED_BY) VALUES(:id,:userId,:permissionId,:effect,:reason,:fromAt,:toAt,:actor,:actor)`,
        {
          id,
          userId: i.userId,
          permissionId: i.permissionId,
          effect: i.effect,
          reason: i.reason ?? null,
          fromAt: effectiveFrom,
          toAt: effectiveTo,
          actor: actor.username,
        },
      ],
      scope: [
        `INSERT INTO SYS_USER_DATA_SCOPE(USER_DATA_SCOPE_ID,USER_ID,SCOPE_TYPE,SITE_ID,RIG_ID,DEPARTMENT_ID,CAN_VIEW,CAN_ACT,EFFECTIVE_FROM,EFFECTIVE_TO,CREATED_BY,UPDATED_BY) VALUES(:id,:userId,:scopeType,:siteId,:rigId,:departmentId,:canView,:canAct,:fromAt,:toAt,:actor,:actor)`,
        {
          id,
          userId: i.userId,
          scopeType: i.scopeType,
          siteId: i.siteId,
          rigId: i.rigId ?? null,
          departmentId: i.departmentId ?? null,
          canView: i.canView === false ? 'N' : 'Y',
          canAct: i.canAct ? 'Y' : 'N',
          fromAt: effectiveFrom,
          toAt: effectiveTo,
          actor: actor.username,
        },
      ],
      workflow: [
        `INSERT INTO JSA_WF_ROLE_ASSIGNMENT(ROLE_ASSIGNMENT_ID,WORKFLOW_ROLE_CODE,USER_ID,SITE_ID,RIG_ID,DEPARTMENT_ID,EFFECTIVE_FROM,EFFECTIVE_TO,CREATED_BY,UPDATED_BY) SELECT :id,:roleCode,U.USER_ID,:siteId,:rigId,:departmentId,:fromAt,:toAt,:actor,:actor FROM SYS_USER U WHERE U.USER_ID=:userId AND U.IS_ACTIVE='Y' AND EXISTS(SELECT 1 FROM JSA_WORKFLOW_STEP S JOIN JSA_WORKFLOW_DEFINITION D ON D.DEFINITION_ID=S.DEFINITION_ID WHERE S.WORKFLOW_ROLE_CODE=:roleCode AND S.IS_ACTIVE='Y' AND D.STATUS_CODE='ACTIVE')`,
        {
          id,
          roleCode: i.workflowRoleCode,
          userId: i.userId,
          siteId: i.siteId,
          rigId: i.rigId ?? null,
          departmentId: i.departmentId ?? null,
          fromAt: effectiveFrom,
          toAt: effectiveTo,
          actor: actor.username,
        },
      ],
    };
    try {
      const r = await c.connection.execute(sql[kind]![0], sql[kind]![1]);
      if (r.rowsAffected !== 1)
        throw new ValidationError('Referenced active records or workflow role are invalid');
    } catch (e: any) {
      if (e?.errorNum === 1)
        throw new DuplicateConflictError('An equivalent active assignment already exists');
      throw e;
    }
    await this.audit(
      c,
      actor,
      `${kind.toUpperCase().replace('-', '_')}_ASSIGNED`,
      meta.table,
      id,
      i,
    );
    return id;
  }
  async updateAssignment(
    c: OracleTransactionContext,
    kind: string,
    id: string,
    i: any,
    actor: any,
  ) {
    assertOracleId(id);
    const meta = assignment[kind as keyof typeof assignment];
    if (!meta) throw new ValidationError('Unsupported assignment type');
    const fromAt = i.effectiveFrom ? new Date(i.effectiveFrom) : new Date();
    const toAt = i.effectiveTo ? new Date(i.effectiveTo) : null;
    if (toAt && toAt <= fromAt)
      throw new ValidationError('Effective To must be later than Effective From');
    if (kind === 'override' && i.effect === 'DENY' && !i.reason?.trim())
      throw new ValidationError('A reason is required for DENY');
    if (kind === 'scope' && i.canAct && !i.canView)
      throw new ValidationError('CAN_ACT requires CAN_VIEW');
    if (kind === 'scope' || kind === 'workflow')
      await this.validateHierarchy(c, i.siteId, i.rigId, i.departmentId);
    const statements: Record<string, [string, any]> = {
      'user-role': [
        `UPDATE SYS_USER_ROLE SET IS_ACTIVE='Y',REVOKED_AT=NULL,UPDATED_AT=SYSTIMESTAMP,
         UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
         WHERE USER_ROLE_ID=:id AND ROW_VERSION=:rowVersion`,
        { id, rowVersion: i.rowVersion, actor: actor.username },
      ],
      'role-permission': [
        `UPDATE SYS_ROLE_PERMISSION SET IS_ACTIVE='Y',REVOKED_AT=NULL,UPDATED_AT=SYSTIMESTAMP,
         UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
         WHERE ROLE_PERMISSION_ID=:id AND ROW_VERSION=:rowVersion`,
        { id, rowVersion: i.rowVersion, actor: actor.username },
      ],
      override: [
        `UPDATE SYS_USER_PERMISSION_OVERRIDE SET EFFECT_CODE=:effect,REASON_TEXT=:reason,
         EFFECTIVE_FROM=:fromAt,EFFECTIVE_TO=:toAt,IS_ACTIVE='Y',UPDATED_AT=SYSTIMESTAMP,
         UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
         WHERE USER_PERMISSION_OVERRIDE_ID=:id AND ROW_VERSION=:rowVersion`,
        {
          id,
          effect: i.effect,
          reason: i.reason ?? null,
          fromAt,
          toAt,
          rowVersion: i.rowVersion,
          actor: actor.username,
        },
      ],
      scope: [
        `UPDATE SYS_USER_DATA_SCOPE SET SCOPE_TYPE=:scopeType,SITE_ID=:siteId,RIG_ID=:rigId,
         DEPARTMENT_ID=:departmentId,CAN_VIEW=:canView,CAN_ACT=:canAct,EFFECTIVE_FROM=:fromAt,
         EFFECTIVE_TO=:toAt,IS_ACTIVE='Y',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,
         ROW_VERSION=ROW_VERSION+1 WHERE USER_DATA_SCOPE_ID=:id AND ROW_VERSION=:rowVersion`,
        {
          id,
          scopeType: i.scopeType,
          siteId: i.siteId,
          rigId: i.rigId ?? null,
          departmentId: i.departmentId ?? null,
          canView: i.canView === false ? 'N' : 'Y',
          canAct: i.canAct ? 'Y' : 'N',
          fromAt,
          toAt,
          rowVersion: i.rowVersion,
          actor: actor.username,
        },
      ],
      workflow: [
        `UPDATE JSA_WF_ROLE_ASSIGNMENT SET WORKFLOW_ROLE_CODE=:roleCode,SITE_ID=:siteId,
         RIG_ID=:rigId,DEPARTMENT_ID=:departmentId,EFFECTIVE_FROM=:fromAt,EFFECTIVE_TO=:toAt,
         IS_ACTIVE='Y',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
         WHERE ROLE_ASSIGNMENT_ID=:id AND ROW_VERSION=:rowVersion
           AND EXISTS(SELECT 1 FROM JSA_WORKFLOW_STEP S JOIN JSA_WORKFLOW_DEFINITION D
             ON D.DEFINITION_ID=S.DEFINITION_ID WHERE S.WORKFLOW_ROLE_CODE=:roleCode
             AND S.IS_ACTIVE='Y' AND D.STATUS_CODE='ACTIVE')`,
        {
          id,
          roleCode: i.workflowRoleCode,
          siteId: i.siteId,
          rigId: i.rigId ?? null,
          departmentId: i.departmentId ?? null,
          fromAt,
          toAt,
          rowVersion: i.rowVersion,
          actor: actor.username,
        },
      ],
    };
    try {
      const result = await c.connection.execute(statements[kind]![0], statements[kind]![1]);
      if (result.rowsAffected !== 1) throw new OptimisticLockError();
    } catch (error: any) {
      if (error?.errorNum === 1)
        throw new DuplicateConflictError('An equivalent active assignment already exists');
      throw error;
    }
    await this.audit(
      c,
      actor,
      `${kind.toUpperCase().replace('-', '_')}_UPDATED`,
      meta.table,
      id,
      i,
    );
  }
  async revokeAssignment(
    c: OracleTransactionContext,
    kind: string,
    id: string,
    rowVersion: string,
    actor: any,
  ) {
    assertOracleId(id);
    const meta = assignment[kind as keyof typeof assignment];
    if (!meta) throw new ValidationError('Unsupported assignment type');
    const r = await c.connection.execute(
      `UPDATE ${meta.table} SET IS_ACTIVE='N',${kind === 'user-role' || kind === 'role-permission' ? 'REVOKED_AT' : 'EFFECTIVE_TO'}=SYSTIMESTAMP,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE ${meta.id}=:id AND ROW_VERSION=:rowVersion AND IS_ACTIVE='Y'`,
      { id, rowVersion, actor: actor.username },
    );
    if (r.rowsAffected !== 1) throw new OptimisticLockError();
    await this.audit(c, actor, `${kind.toUpperCase().replace('-', '_')}_REVOKED`, meta.table, id, {
      reason: actor.reason,
    });
  }
  async pendingImpact(c: OracleTransactionContext, i: any) {
    const r = await c.connection.execute<Row>(
      `SELECT TO_CHAR(T.WORKFLOW_TASK_ID) TASK_ID,M.JSA_NUMBER,
              T.STEP_CODE_SNAPSHOT STEP_CODE,T.STEP_NAME_SNAPSHOT STEP_NAME,
              T.ASSIGNEE_DISPLAY_SNAPSHOT ASSIGNEE_NAME
       FROM JSA_WORKFLOW_TASK T JOIN JSA_WORKFLOW_INSTANCE I ON I.INSTANCE_ID=T.INSTANCE_ID
       JOIN JSA_MASTER M ON M.JSA_ID=I.JSA_ID
       WHERE T.TASK_STATUS='PENDING' AND I.INSTANCE_STATUS='ACTIVE'
         AND (:userId IS NULL OR T.ASSIGNEE_USER_ID=:userId)
         AND (:workflowId IS NULL OR EXISTS(
           SELECT 1 FROM JSA_WF_ROLE_ASSIGNMENT A WHERE A.ROLE_ASSIGNMENT_ID=:workflowId
             AND A.USER_ID=T.ASSIGNEE_USER_ID AND A.WORKFLOW_ROLE_CODE=T.WF_ROLE_CODE_SNAPSHOT))
         AND (:scopeId IS NULL OR EXISTS(SELECT 1 FROM SYS_USER_DATA_SCOPE S WHERE S.USER_DATA_SCOPE_ID=:scopeId AND S.USER_ID=T.ASSIGNEE_USER_ID))
         AND (:roleId IS NULL OR EXISTS(SELECT 1 FROM SYS_USER_ROLE UR WHERE UR.ROLE_ID=:roleId AND UR.USER_ID=T.ASSIGNEE_USER_ID AND UR.IS_ACTIVE='Y'))
         AND (:permissionId IS NULL OR EXISTS(
           SELECT 1 FROM SYS_ROLE_PERMISSION RP JOIN SYS_USER_ROLE UR ON UR.ROLE_ID=RP.ROLE_ID AND UR.IS_ACTIVE='Y'
           WHERE RP.PERMISSION_ID=:permissionId AND RP.IS_ACTIVE='Y' AND UR.USER_ID=T.ASSIGNEE_USER_ID))
       ORDER BY T.CREATED_AT`,
      {
        userId: i.userId ?? null,
        workflowId: i.workflowAssignmentId ?? null,
        scopeId: i.scopeId ?? null,
        roleId: i.roleId ?? null,
        permissionId: i.permissionId ?? null,
      },
      opts,
    );
    return r.rows ?? [];
  }
  async effectiveAccess(c: OracleTransactionContext, userId: string, effectiveAt?: string) {
    const user = await this.user(c, userId);
    const at = effectiveAt ? new Date(effectiveAt) : new Date();
    const permissions = await c.connection.execute<Row>(
      `SELECT P.PERMISSION_CODE,
        CASE WHEN MAX(CASE WHEN O.EFFECT_CODE='DENY' THEN 3 WHEN O.EFFECT_CODE='ALLOW' THEN 2 WHEN UR.USER_ROLE_ID IS NOT NULL THEN 1 ELSE 0 END)=3 THEN 'DENY' ELSE 'ALLOW' END FINAL_RESULT,
        CASE MAX(CASE WHEN O.EFFECT_CODE='DENY' THEN 3 WHEN O.EFFECT_CODE='ALLOW' THEN 2 WHEN UR.USER_ROLE_ID IS NOT NULL THEN 1 ELSE 0 END)
          WHEN 3 THEN 'USER_DENY' WHEN 2 THEN 'USER_ALLOW' WHEN 1 THEN 'ROLE_GRANT' ELSE 'DEFAULT_DENY' END SOURCE
       FROM SYS_PERMISSION P
       LEFT JOIN SYS_USER_PERMISSION_OVERRIDE O ON O.PERMISSION_ID=P.PERMISSION_ID AND O.USER_ID=:userId AND O.IS_ACTIVE='Y' AND O.EFFECTIVE_FROM<=:at AND (O.EFFECTIVE_TO IS NULL OR O.EFFECTIVE_TO>=:at)
       LEFT JOIN SYS_ROLE_PERMISSION RP ON RP.PERMISSION_ID=P.PERMISSION_ID AND RP.IS_ACTIVE='Y'
       LEFT JOIN SYS_USER_ROLE UR ON UR.ROLE_ID=RP.ROLE_ID AND UR.USER_ID=:userId AND UR.IS_ACTIVE='Y'
       WHERE P.IS_ACTIVE='Y'
       GROUP BY P.PERMISSION_CODE
       HAVING MAX(CASE WHEN O.EFFECT_CODE='DENY' THEN 3 WHEN O.EFFECT_CODE='ALLOW' THEN 2 WHEN UR.USER_ROLE_ID IS NOT NULL THEN 1 ELSE 0 END)>0
       ORDER BY P.PERMISSION_CODE`,
      { userId, at },
      opts,
    );
    const roles = await this.userAssignments(c, userId, 'roles');
    const scopes = await this.userAssignments(c, userId, 'scopes');
    const workflow = await this.userAssignments(c, userId, 'workflow');
    const tasks = await this.pendingImpact(c, { userId });
    return {
      identity: user,
      effectiveAt: at.toISOString(),
      roles,
      permissions: permissions.rows ?? [],
      scopes,
      workflowRoleAssignments: workflow,
      pendingTasks: tasks,
    };
  }
  async auditEvents(c: OracleTransactionContext, q: PageQuery) {
    const binds = {
      search: q.search ? `%${q.search.toUpperCase()}%` : null,
      offset: q.offset,
      limit: q.limit,
    };
    const r = await c.connection.execute<Row>(
      `SELECT TO_CHAR(AUDIT_EVENT_ID) ID,ACTION_CODE,TARGET_ENTITY_TYPE TARGET_TYPE,TO_CHAR(TARGET_ENTITY_ID) TARGET_ID,TARGET_USERNAME_SNAPSHOT,ACTOR_USERNAME_SNAPSHOT,REASON_TEXT,CORRELATION_ID,OCCURRED_AT FROM SYS_ACCESS_ADMIN_AUDIT WHERE (:search IS NULL OR UPPER(ACTION_CODE) LIKE :search OR UPPER(TARGET_USERNAME_SNAPSHOT) LIKE :search) ORDER BY OCCURRED_AT DESC OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      binds,
      opts,
    );
    const n = await c.connection.execute<Row>(
      `SELECT COUNT(*) TOTAL FROM SYS_ACCESS_ADMIN_AUDIT WHERE (:search IS NULL OR UPPER(ACTION_CODE) LIKE :search OR UPPER(TARGET_USERNAME_SNAPSHOT) LIKE :search)`,
      { search: binds.search },
      opts,
    );
    return {
      items: r.rows ?? [],
      total: n.rows?.[0]?.TOTAL ?? 0,
      offset: q.offset,
      limit: q.limit,
    };
  }
  async auditEvent(c: OracleTransactionContext, id: string) {
    assertOracleId(id);
    const r = await c.connection.execute<Row>(
      `SELECT TO_CHAR(AUDIT_EVENT_ID) ID,ACTION_CODE,TARGET_ENTITY_TYPE TARGET_TYPE,TO_CHAR(TARGET_ENTITY_ID) TARGET_ID,TARGET_USERNAME_SNAPSHOT,ACTOR_USERNAME_SNAPSHOT,ACTOR_DISPLAY_SNAPSHOT,TO_CHAR(SITE_ID) SITE_ID,TO_CHAR(RIG_ID) RIG_ID,TO_CHAR(DEPARTMENT_ID) DEPARTMENT_ID,BEFORE_STATE,AFTER_STATE,REASON_TEXT,CORRELATION_ID,OCCURRED_AT FROM SYS_ACCESS_ADMIN_AUDIT WHERE AUDIT_EVENT_ID=:id`,
      { id },
      opts,
    );
    if (!r.rows?.[0]) throw new ResourceNotFoundError('Audit event was not found');
    return r.rows[0];
  }
  private async validateDefaults(c: OracleTransactionContext, i: any) {
    if (!i.defaultSiteId && (i.defaultRigId || i.defaultDepartmentId))
      throw new ValidationError('Default Site is required for Rig or Department defaults');
    if (i.defaultSiteId)
      await this.validateHierarchy(c, i.defaultSiteId, i.defaultRigId, i.defaultDepartmentId);
  }
  private async validateHierarchy(
    c: OracleTransactionContext,
    siteId?: string,
    rigId?: string,
    departmentId?: string,
  ) {
    if (!siteId) throw new ValidationError('Site is required');
    assertOracleId(siteId);
    if (rigId) assertOracleId(rigId);
    if (departmentId) assertOracleId(departmentId);
    const r = await c.connection.execute<Row>(
      `SELECT COUNT(*) VALID_COUNT FROM SYS_SITE S
       WHERE S.SITE_ID=:siteId AND S.IS_ACTIVE='Y'
         AND (:rigId IS NULL OR EXISTS(SELECT 1 FROM SYS_RIG R WHERE R.RIG_ID=:rigId AND R.SITE_ID=S.SITE_ID AND R.IS_ACTIVE='Y'))
         AND (:departmentId IS NULL OR EXISTS(SELECT 1 FROM SYS_DEPARTMENT D WHERE D.DEPARTMENT_ID=:departmentId AND D.SITE_ID=S.SITE_ID AND D.IS_ACTIVE='Y' AND (:rigId IS NULL OR D.RIG_ID IS NULL OR D.RIG_ID=:rigId)))`,
      { siteId, rigId: rigId ?? null, departmentId: departmentId ?? null },
      opts,
    );
    if (r.rows?.[0]?.VALID_COUNT !== 1)
      throw new ValidationError('Site, Rig and Department hierarchy is invalid');
  }
  private async audit(
    c: OracleTransactionContext,
    actor: any,
    action: string,
    type: string,
    id: string,
    after?: any,
    before?: any,
  ) {
    const auditId = await this.next(c, 'SEQ_SYS_ACCESS_ADMIN_AUDIT');
    await c.connection.execute(
      `INSERT INTO SYS_ACCESS_ADMIN_AUDIT(AUDIT_EVENT_ID,ACTION_CODE,TARGET_ENTITY_TYPE,TARGET_ENTITY_ID,TARGET_USERNAME_SNAPSHOT,
        ACTOR_USER_ID,ACTOR_USERNAME_SNAPSHOT,ACTOR_DISPLAY_SNAPSHOT,SITE_ID,RIG_ID,DEPARTMENT_ID,
        BEFORE_STATE,AFTER_STATE,REASON_TEXT,CORRELATION_ID,CREATED_SITE_ID)
       VALUES(:auditId,:action,:type,:targetId,
        (SELECT USERNAME FROM SYS_USER WHERE USER_ID=CASE WHEN :type='SYS_USER' THEN :targetId END),
        :actorId,:actorName,:actorDisplay,:siteId,:rigId,:departmentId,:beforeJson,:afterJson,:reason,
        :correlationId,:siteId)`,
      {
        auditId,
        action,
        type,
        targetId: id,
        actorId: actor.userId,
        actorName: actor.username,
        actorDisplay: actor.displayName,
        siteId: actor.defaultSiteId,
        rigId: actor.defaultRigId ?? null,
        departmentId: actor.defaultDepartmentId ?? null,
        beforeJson: before ? JSON.stringify(before) : null,
        afterJson: after ? JSON.stringify(after) : null,
        reason: after?.reason ?? null,
        correlationId: correlationContext.getStore()?.correlationId ?? `access-admin-${auditId}`,
      },
    );
  }
  private async next(c: OracleTransactionContext, sequence: string) {
    const allowed = [
      'SEQ_SYS_USER',
      'SEQ_SYS_ROLE',
      'SEQ_SYS_USER_ROLE',
      'SEQ_SYS_ROLE_PERMISSION',
      'SEQ_SYS_USER_PERM_OVERRIDE',
      'SEQ_SYS_USER_DATA_SCOPE',
      'SEQ_JSA_WF_ROLE_ASSIGN',
      'SEQ_SYS_ACCESS_ADMIN_AUDIT',
    ];
    if (!allowed.includes(sequence)) throw new ValidationError('Sequence is not allowlisted');
    const r = await c.connection.execute<Row>(
      `SELECT TO_CHAR(${sequence}.NEXTVAL) ID FROM DUAL`,
      {},
      opts,
    );
    return r.rows![0]!.ID as string;
  }
}
