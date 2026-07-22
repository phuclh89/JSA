import { Injectable } from '@nestjs/common';
import oracledb from 'oracledb';
import type { DataScope, PermissionOverride } from '@jsams/shared-types';
import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import { assertOracleId } from '../../../common/oracle/oracle-id';
import type { SecurityRepository } from '../domain/security.repository';
import type { ApplicationUserRecord, SecurityAssignments } from '../domain/security.types';

interface UserRow {
  USER_ID: string;
  ENTERPRISE_IDENTITY_KEY: string;
  USERNAME: string;
  DISPLAY_NAME: string;
  EMAIL?: string;
  DEFAULT_SITE_ID?: string;
  DEFAULT_RIG_ID?: string;
  DEFAULT_DEPARTMENT_ID?: string;
  IS_ACTIVE: 'Y' | 'N';
}
interface CodeRow {
  CODE_VALUE: string;
}
interface OverrideRow {
  PERMISSION_CODE: string;
  EFFECT_CODE: 'ALLOW' | 'DENY';
}
interface ScopeRow {
  SCOPE_TYPE: DataScope['scopeType'];
  SITE_ID: string;
  RIG_ID?: string;
  DEPARTMENT_ID?: string;
  CAN_VIEW: 'Y' | 'N';
  CAN_ACT: 'Y' | 'N';
}

@Injectable()
export class OracleSecurityRepository implements SecurityRepository {
  async findUser(
    { connection }: OracleTransactionContext,
    identityKey: string,
    username: string,
    allowUsernameFallback: boolean,
  ): Promise<ApplicationUserRecord | undefined> {
    const result = await connection.execute<UserRow>(
      `SELECT TO_CHAR(USER_ID) AS USER_ID,
              ENTERPRISE_IDENTITY_KEY, USERNAME, DISPLAY_NAME, EMAIL,
              TO_CHAR(DEFAULT_SITE_ID) AS DEFAULT_SITE_ID,
              TO_CHAR(DEFAULT_RIG_ID) AS DEFAULT_RIG_ID,
              TO_CHAR(DEFAULT_DEPARTMENT_ID) AS DEFAULT_DEPARTMENT_ID,
              IS_ACTIVE
       FROM SYS_USER
       WHERE UPPER(ENTERPRISE_IDENTITY_KEY) = UPPER(:identityKey)
          OR (:allowUsernameFallback = 'Y' AND UPPER(USERNAME) = UPPER(:username))
       ORDER BY CASE WHEN UPPER(ENTERPRISE_IDENTITY_KEY) = UPPER(:identityKey) THEN 0 ELSE 1 END
       FETCH FIRST 1 ROW ONLY`,
      { identityKey, username, allowUsernameFallback: allowUsernameFallback ? 'Y' : 'N' },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const row = result.rows?.[0];
    if (!row) return undefined;
    return {
      userId: row.USER_ID,
      enterpriseIdentityKey: row.ENTERPRISE_IDENTITY_KEY,
      username: row.USERNAME,
      displayName: row.DISPLAY_NAME,
      ...(row.EMAIL ? { email: row.EMAIL } : {}),
      ...(row.DEFAULT_SITE_ID ? { defaultSiteId: row.DEFAULT_SITE_ID } : {}),
      ...(row.DEFAULT_RIG_ID ? { defaultRigId: row.DEFAULT_RIG_ID } : {}),
      ...(row.DEFAULT_DEPARTMENT_ID ? { defaultDepartmentId: row.DEFAULT_DEPARTMENT_ID } : {}),
      active: row.IS_ACTIVE === 'Y',
    };
  }

  async loadAssignments(
    { connection }: OracleTransactionContext,
    userId: string,
  ): Promise<SecurityAssignments> {
    assertOracleId(userId, 'userId');
    const options = { outFormat: oracledb.OUT_FORMAT_OBJECT } as const;
    const roles = await connection.execute<CodeRow>(
      `SELECT DISTINCT R.ROLE_CODE AS CODE_VALUE
       FROM SYS_USER_ROLE UR JOIN SYS_ROLE R ON R.ROLE_ID = UR.ROLE_ID
       WHERE UR.USER_ID = :userId AND UR.IS_ACTIVE = 'Y' AND R.IS_ACTIVE = 'Y'`,
      { userId },
      options,
    );
    const rolePermissions = await connection.execute<CodeRow>(
      `SELECT DISTINCT P.PERMISSION_CODE AS CODE_VALUE
       FROM SYS_USER_ROLE UR
       JOIN SYS_ROLE R ON R.ROLE_ID = UR.ROLE_ID AND R.IS_ACTIVE = 'Y'
       JOIN SYS_ROLE_PERMISSION RP ON RP.ROLE_ID = R.ROLE_ID AND RP.IS_ACTIVE = 'Y'
       JOIN SYS_PERMISSION P ON P.PERMISSION_ID = RP.PERMISSION_ID AND P.IS_ACTIVE = 'Y'
       WHERE UR.USER_ID = :userId AND UR.IS_ACTIVE = 'Y'`,
      { userId },
      options,
    );
    const overrides = await connection.execute<OverrideRow>(
      `SELECT P.PERMISSION_CODE, O.EFFECT_CODE
       FROM SYS_USER_PERMISSION_OVERRIDE O
       JOIN SYS_PERMISSION P ON P.PERMISSION_ID = O.PERMISSION_ID AND P.IS_ACTIVE = 'Y'
       WHERE O.USER_ID = :userId AND O.IS_ACTIVE = 'Y'
         AND O.EFFECTIVE_FROM <= SYSTIMESTAMP
         AND (O.EFFECTIVE_TO IS NULL OR O.EFFECTIVE_TO >= SYSTIMESTAMP)`,
      { userId },
      options,
    );
    const scopes = await connection.execute<ScopeRow>(
      `SELECT S.SCOPE_TYPE, TO_CHAR(S.SITE_ID) AS SITE_ID,
              TO_CHAR(S.RIG_ID) AS RIG_ID, TO_CHAR(S.DEPARTMENT_ID) AS DEPARTMENT_ID,
              S.CAN_VIEW, S.CAN_ACT
       FROM SYS_USER_DATA_SCOPE S
       JOIN SYS_SITE SI ON SI.SITE_ID = S.SITE_ID AND SI.IS_ACTIVE = 'Y'
       LEFT JOIN SYS_RIG R ON R.RIG_ID = S.RIG_ID AND R.SITE_ID = S.SITE_ID AND R.IS_ACTIVE = 'Y'
       LEFT JOIN SYS_DEPARTMENT D ON D.DEPARTMENT_ID = S.DEPARTMENT_ID
         AND D.SITE_ID = S.SITE_ID AND D.IS_ACTIVE = 'Y'
       WHERE S.USER_ID = :userId AND S.IS_ACTIVE = 'Y'
         AND S.EFFECTIVE_FROM <= SYSTIMESTAMP
         AND (S.EFFECTIVE_TO IS NULL OR S.EFFECTIVE_TO >= SYSTIMESTAMP)
         AND (S.RIG_ID IS NULL OR R.RIG_ID IS NOT NULL)
         AND (S.DEPARTMENT_ID IS NULL OR D.DEPARTMENT_ID IS NOT NULL)
         AND (S.DEPARTMENT_ID IS NULL OR (D.RIG_ID IS NULL AND S.RIG_ID IS NULL) OR D.RIG_ID = S.RIG_ID)`,
      { userId },
      options,
    );
    return {
      roles: (roles.rows ?? []).map((row) => row.CODE_VALUE).sort(),
      rolePermissions: (rolePermissions.rows ?? []).map((row) => row.CODE_VALUE).sort(),
      overrides: (overrides.rows ?? []).map<PermissionOverride>((row) => ({
        permissionCode: row.PERMISSION_CODE,
        effect: row.EFFECT_CODE,
      })),
      dataScopes: (scopes.rows ?? []).map<DataScope>((row) => ({
        scopeType: row.SCOPE_TYPE,
        siteId: row.SITE_ID,
        ...(row.RIG_ID ? { rigId: row.RIG_ID } : {}),
        ...(row.DEPARTMENT_ID ? { departmentId: row.DEPARTMENT_ID } : {}),
        canView: row.CAN_VIEW === 'Y',
        canAct: row.CAN_ACT === 'Y',
      })),
    };
  }
}
