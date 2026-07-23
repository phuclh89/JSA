import { Injectable } from '@nestjs/common';
import type { MasterDataKind, MasterDataRecord, OrganizationOption } from '@jsams/shared-types';
import oracledb from 'oracledb';
import { assertOracleId } from '../../../common/oracle/oracle-id';
import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import type { MasterDataRepository } from '../domain/master-data.repository';
import type {
  MasterDataInput,
  MasterDataListQuery,
  MasterDataPage,
} from '../domain/master-data.types';

interface EntityConfig {
  table: string;
  id: string;
  sequence: string;
  code: string;
  name: string;
  description?: string;
  extra: Record<string, { column: string; type: 'string' | 'number' | 'boolean' }>;
}

const configs: Record<MasterDataKind, EntityConfig> = {
  'job-types': {
    table: 'SYS_JOB_TYPE',
    id: 'JOB_TYPE_ID',
    sequence: 'SEQ_SYS_JOB_TYPE',
    code: 'JOB_TYPE_CODE',
    name: 'JOB_TYPE_NAME',
    description: 'DESCRIPTION',
    extra: {},
  },
  'hazard-prompts': {
    table: 'SYS_HAZARD_PROMPT',
    id: 'PROMPT_ID',
    sequence: 'SEQ_SYS_HAZARD_PROMPT',
    code: 'PROMPT_CODE',
    name: 'PROMPT_LABEL',
    description: 'DESCRIPTION',
    extra: { group: { column: 'PROMPT_GROUP', type: 'string' } },
  },
  positions: {
    table: 'SYS_POSITION',
    id: 'POSITION_ID',
    sequence: 'SEQ_SYS_POSITION',
    code: 'POSITION_CODE',
    name: 'POSITION_NAME',
    description: 'DESCRIPTION',
    extra: { alternateName: { column: 'ALTERNATE_NAME', type: 'string' } },
  },
  'tool-categories': {
    table: 'SYS_TOOL_CATEGORY',
    id: 'TOOL_CATEGORY_ID',
    sequence: 'SEQ_SYS_TOOL_CATEGORY',
    code: 'CATEGORY_CODE',
    name: 'CATEGORY_NAME',
    description: 'DESCRIPTION',
    extra: {},
  },
  tools: {
    table: 'SYS_TOOL',
    id: 'TOOL_ID',
    sequence: 'SEQ_SYS_TOOL',
    code: 'TOOL_CODE',
    name: 'TOOL_NAME',
    description: 'DESCRIPTION',
    extra: {
      toolCategoryId: { column: 'TOOL_CATEGORY_ID', type: 'string' },
      alternateName: { column: 'ALTERNATE_NAME', type: 'string' },
    },
  },
  languages: {
    table: 'SYS_LANGUAGE',
    id: 'LANGUAGE_ID',
    sequence: 'SEQ_SYS_LANGUAGE',
    code: 'LANGUAGE_CODE',
    name: 'LANGUAGE_NAME',
    extra: { localeCode: { column: 'LOCALE_CODE', type: 'string' } },
  },
  'procedure-references': {
    table: 'SYS_PROCEDURE_REFERENCE',
    id: 'PROCEDURE_REFERENCE_ID',
    sequence: 'SEQ_SYS_PROCEDURE_REF',
    code: 'REFERENCE_CODE',
    name: 'TITLE',
    description: 'DESCRIPTION',
    extra: {
      documentVersion: { column: 'DOCUMENT_VERSION', type: 'string' },
      effectiveDate: { column: 'EFFECTIVE_DATE', type: 'string' },
      expiryDate: { column: 'EXPIRY_DATE', type: 'string' },
      externalUrl: { column: 'EXTERNAL_URL', type: 'string' },
    },
  },
  'system-parameters': {
    table: 'SYS_SYSTEM_PARAMETER',
    id: 'SYSTEM_PARAMETER_ID',
    sequence: 'SEQ_SYS_SYSTEM_PARAMETER',
    code: 'PARAMETER_KEY',
    name: 'PARAMETER_KEY',
    description: 'DESCRIPTION',
    extra: {
      valueType: { column: 'VALUE_TYPE', type: 'string' },
      value: { column: 'PARAMETER_VALUE', type: 'string' },
    },
  },
};

interface MasterRow {
  ID_VALUE: string;
  CODE_VALUE: string;
  NAME_VALUE: string;
  DESCRIPTION_VALUE?: string;
  DISPLAY_ORDER: number;
  SCOPE_TYPE: MasterDataRecord['scopeType'];
  SITE_ID?: string;
  RIG_ID?: string;
  DEPARTMENT_ID?: string;
  IS_ACTIVE: 'Y' | 'N';
  ROW_VERSION: string;
  [key: string]: unknown;
}

@Injectable()
export class OracleMasterDataRepository implements MasterDataRepository {
  async listScopeOptions(
    { connection }: OracleTransactionContext,
    type: 'SITE' | 'RIG' | 'DEPARTMENT',
    siteId?: string,
    rigId?: string,
  ): Promise<OrganizationOption[]> {
    if (siteId) assertOracleId(siteId, 'siteId');
    if (rigId) assertOracleId(rigId, 'rigId');
    const statements = {
      SITE: `SELECT TO_CHAR(SITE_ID) ID_VALUE,SITE_CODE CODE_VALUE,SITE_NAME NAME_VALUE,NULL SITE_ID,NULL RIG_ID FROM SYS_SITE WHERE IS_ACTIVE='Y' ORDER BY SITE_NAME`,
      RIG: `SELECT TO_CHAR(RIG_ID) ID_VALUE,RIG_CODE CODE_VALUE,RIG_NAME NAME_VALUE,TO_CHAR(SITE_ID) SITE_ID,NULL RIG_ID FROM SYS_RIG WHERE IS_ACTIVE='Y' AND (:siteId IS NULL OR SITE_ID=:siteId) ORDER BY RIG_NAME`,
      DEPARTMENT: `SELECT TO_CHAR(DEPARTMENT_ID) ID_VALUE,DEPARTMENT_CODE CODE_VALUE,DEPARTMENT_NAME NAME_VALUE,TO_CHAR(SITE_ID) SITE_ID,TO_CHAR(RIG_ID) RIG_ID FROM SYS_DEPARTMENT WHERE IS_ACTIVE='Y' AND (:siteId IS NULL OR SITE_ID=:siteId) AND (:rigId IS NULL OR RIG_ID IS NULL OR RIG_ID=:rigId) ORDER BY DEPARTMENT_NAME`,
    };
    const binds =
      type === 'SITE'
        ? {}
        : type === 'RIG'
          ? { siteId: siteId ?? null }
          : { siteId: siteId ?? null, rigId: rigId ?? null };
    const result = await connection.execute<{
      ID_VALUE: string;
      CODE_VALUE: string;
      NAME_VALUE: string;
      SITE_ID?: string;
      RIG_ID?: string;
    }>(
      statements[type],
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return (result.rows ?? []).map((row) => ({
      id: row.ID_VALUE,
      code: row.CODE_VALUE,
      name: row.NAME_VALUE,
      ...(row.SITE_ID ? { siteId: row.SITE_ID } : {}),
      ...(row.RIG_ID ? { rigId: row.RIG_ID } : {}),
    }));
  }
  async list(
    { connection }: OracleTransactionContext,
    kind: MasterDataKind,
    query: MasterDataListQuery,
  ): Promise<MasterDataPage> {
    const config = configs[kind];
    const where: string[] = ['1=1'];
    const binds: oracledb.BindParameters = {};
    if (query.keyword) {
      where.push(`(UPPER(${config.code}) LIKE :keyword OR UPPER(${config.name}) LIKE :keyword)`);
      binds.keyword = `%${query.keyword.toUpperCase()}%`;
    }
    if (query.active !== undefined) {
      where.push('IS_ACTIVE = :active');
      binds.active = query.active ? 'Y' : 'N';
    }
    for (const [field, column] of [
      ['siteId', 'SITE_ID'],
      ['rigId', 'RIG_ID'],
      ['departmentId', 'DEPARTMENT_ID'],
    ] as const) {
      const value = query[field];
      if (value) {
        assertOracleId(value, field);
        where.push(`${column} = :${field}`);
        binds[field] = value;
      }
    }
    if (query.categoryId && kind === 'tools') {
      assertOracleId(query.categoryId, 'categoryId');
      where.push('TOOL_CATEGORY_ID = :categoryId');
      binds.categoryId = query.categoryId;
    }
    const count = await connection.execute<{ TOTAL_COUNT: number }>(
      `SELECT COUNT(*) AS TOTAL_COUNT FROM ${config.table} WHERE ${where.join(' AND ')}`,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    binds.offsetRows = (query.page - 1) * query.pageSize;
    binds.fetchRows = query.pageSize;
    const result = await connection.execute<MasterRow>(
      `${this.selectSql(config)} WHERE ${where.join(' AND ')} ORDER BY DISPLAY_ORDER, ${config.name}, ${config.id} OFFSET :offsetRows ROWS FETCH NEXT :fetchRows ROWS ONLY`,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return {
      items: (result.rows ?? []).map((row) => this.mapRow(kind, config, row)),
      page: query.page,
      pageSize: query.pageSize,
      total: count.rows?.[0]?.TOTAL_COUNT ?? 0,
    };
  }

  async findById(
    { connection }: OracleTransactionContext,
    kind: MasterDataKind,
    id: string,
  ): Promise<MasterDataRecord | undefined> {
    assertOracleId(id);
    const config = configs[kind];
    const result = await connection.execute<MasterRow>(
      `${this.selectSql(config)} WHERE ${config.id} = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const row = result.rows?.[0];
    return row ? this.mapRow(kind, config, row) : undefined;
  }

  async validateScope(
    { connection }: OracleTransactionContext,
    scope: Pick<MasterDataInput, 'scopeType' | 'siteId' | 'rigId' | 'departmentId'>,
  ): Promise<boolean> {
    if (scope.scopeType === 'GLOBAL') return !scope.siteId && !scope.rigId && !scope.departmentId;
    if (!scope.siteId) return false;
    assertOracleId(scope.siteId, 'siteId');
    if (scope.rigId) assertOracleId(scope.rigId, 'rigId');
    if (scope.departmentId) assertOracleId(scope.departmentId, 'departmentId');
    const result = await connection.execute<{ VALID_COUNT: number }>(
      `SELECT COUNT(*) AS VALID_COUNT FROM SYS_SITE S
       LEFT JOIN SYS_RIG R ON R.RIG_ID = :rigId AND R.SITE_ID = S.SITE_ID AND R.IS_ACTIVE='Y'
       LEFT JOIN SYS_DEPARTMENT D ON D.DEPARTMENT_ID = :departmentId AND D.SITE_ID = S.SITE_ID AND D.IS_ACTIVE='Y'
       WHERE S.SITE_ID=:siteId AND S.IS_ACTIVE='Y'
         AND (:rigId IS NULL OR R.RIG_ID IS NOT NULL)
         AND (:departmentId IS NULL OR D.DEPARTMENT_ID IS NOT NULL)
         AND (:departmentId IS NULL OR :rigId IS NULL OR D.RIG_ID IS NULL OR D.RIG_ID=:rigId)`,
      {
        siteId: scope.siteId,
        rigId: scope.rigId ?? null,
        departmentId: scope.departmentId ?? null,
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return result.rows?.[0]?.VALID_COUNT === 1;
  }

  async isToolCategoryActive(
    { connection }: OracleTransactionContext,
    categoryId: string,
  ): Promise<boolean> {
    assertOracleId(categoryId, 'toolCategoryId');
    const result = await connection.execute<{ VALID_COUNT: number }>(
      "SELECT COUNT(*) AS VALID_COUNT FROM SYS_TOOL_CATEGORY WHERE TOOL_CATEGORY_ID=:categoryId AND IS_ACTIVE='Y'",
      { categoryId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return result.rows?.[0]?.VALID_COUNT === 1;
  }

  async create(
    context: OracleTransactionContext,
    kind: MasterDataKind,
    input: MasterDataInput,
    actor: string,
  ): Promise<MasterDataRecord> {
    const config = configs[kind];
    const values = this.writeValues(config, input);
    const columns = [
      config.id,
      config.code,
      ...(config.name === config.code ? [] : [config.name]),
      ...(config.description ? [config.description] : []),
      'DISPLAY_ORDER',
      'SCOPE_TYPE',
      'SITE_ID',
      'RIG_ID',
      'DEPARTMENT_ID',
      ...Object.values(config.extra).map((item) => item.column),
      'CREATED_BY',
      'UPDATED_BY',
    ];
    const uniqueColumns = [...new Set(columns)];
    const binds: oracledb.BindParameters = { ...values, actor };
    await context.connection.execute(
      `INSERT INTO ${config.table} (${uniqueColumns.join(',')}) VALUES (${uniqueColumns.map((column) => (column === config.id ? `${config.sequence}.NEXTVAL` : `:${this.bindName(config, column)}`)).join(',')})`,
      binds,
    );
    const idResult = await context.connection.execute<{ ID_VALUE: string }>(
      `SELECT TO_CHAR(${config.sequence}.CURRVAL) AS ID_VALUE FROM DUAL`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return (await this.findById(context, kind, idResult.rows?.[0]?.ID_VALUE ?? ''))!;
  }

  async update(
    context: OracleTransactionContext,
    kind: MasterDataKind,
    id: string,
    input: MasterDataInput,
    rowVersion: string,
    actor: string,
  ): Promise<MasterDataRecord | undefined> {
    assertOracleId(id);
    assertOracleId(rowVersion, 'rowVersion');
    const config = configs[kind];
    const values = this.writeValues(config, input);
    const columns = [
      config.code,
      ...(config.name === config.code ? [] : [config.name]),
      ...(config.description ? [config.description] : []),
      'DISPLAY_ORDER',
      'SCOPE_TYPE',
      'SITE_ID',
      'RIG_ID',
      'DEPARTMENT_ID',
      ...Object.values(config.extra).map((item) => item.column),
    ];
    const result = await context.connection.execute(
      `UPDATE ${config.table} SET ${[...new Set(columns)].map((column) => `${column}=:${this.bindName(config, column)}`).join(',')}, UPDATED_AT=SYSTIMESTAMP, UPDATED_BY=:actor, ROW_VERSION=ROW_VERSION+1 WHERE ${config.id}=:id AND ROW_VERSION=:rowVersion`,
      { ...values, actor, id, rowVersion },
    );
    if ((result.rowsAffected ?? 0) !== 1) return undefined;
    return this.findById(context, kind, id);
  }

  async setActive(
    context: OracleTransactionContext,
    kind: MasterDataKind,
    id: string,
    active: boolean,
    rowVersion: string,
    actor: string,
  ): Promise<MasterDataRecord | undefined> {
    assertOracleId(id);
    assertOracleId(rowVersion, 'rowVersion');
    const config = configs[kind];
    const result = await context.connection.execute(
      `UPDATE ${config.table} SET IS_ACTIVE=:active, UPDATED_AT=SYSTIMESTAMP, UPDATED_BY=:actor, ROW_VERSION=ROW_VERSION+1 WHERE ${config.id}=:id AND ROW_VERSION=:rowVersion`,
      { active: active ? 'Y' : 'N', actor, id, rowVersion },
    );
    if ((result.rowsAffected ?? 0) !== 1) return undefined;
    return this.findById(context, kind, id);
  }

  private selectSql(config: EntityConfig): string {
    const extras = Object.entries(config.extra).map(([key, item]) =>
      item.column === 'PARAMETER_VALUE'
        ? `DBMS_LOB.SUBSTR(${item.column},4000,1) AS ATTR_${key.toUpperCase()}`
        : `${item.column} AS ATTR_${key.toUpperCase()}`,
    );
    return `SELECT TO_CHAR(${config.id}) AS ID_VALUE, ${config.code} AS CODE_VALUE, ${config.name} AS NAME_VALUE, ${config.description ? `${config.description} AS DESCRIPTION_VALUE` : 'NULL AS DESCRIPTION_VALUE'}, DISPLAY_ORDER, SCOPE_TYPE, TO_CHAR(SITE_ID) AS SITE_ID, TO_CHAR(RIG_ID) AS RIG_ID, TO_CHAR(DEPARTMENT_ID) AS DEPARTMENT_ID, IS_ACTIVE, TO_CHAR(ROW_VERSION) AS ROW_VERSION${extras.length ? `, ${extras.join(',')}` : ''} FROM ${config.table}`;
  }

  private mapRow(kind: MasterDataKind, config: EntityConfig, row: MasterRow): MasterDataRecord {
    const attributes: Record<string, string | number | boolean | null> = {};
    for (const [key, item] of Object.entries(config.extra)) {
      const value = row[`ATTR_${key.toUpperCase()}`];
      attributes[key] =
        value == null ? null : item.type === 'boolean' ? value === 'Y' : (value as string | number);
    }
    return {
      id: row.ID_VALUE,
      kind,
      code: row.CODE_VALUE,
      name: row.NAME_VALUE,
      ...(row.DESCRIPTION_VALUE ? { description: row.DESCRIPTION_VALUE } : {}),
      displayOrder: row.DISPLAY_ORDER,
      scopeType: row.SCOPE_TYPE,
      ...(row.SITE_ID ? { siteId: row.SITE_ID } : {}),
      ...(row.RIG_ID ? { rigId: row.RIG_ID } : {}),
      ...(row.DEPARTMENT_ID ? { departmentId: row.DEPARTMENT_ID } : {}),
      active: row.IS_ACTIVE === 'Y',
      rowVersion: row.ROW_VERSION,
      attributes,
    };
  }

  private writeValues(config: EntityConfig, input: MasterDataInput): Record<string, unknown> {
    const values: Record<string, unknown> = {
      codeValue: input.code.trim(),
      nameValue: input.name.trim(),
      descriptionValue: input.description?.trim() || null,
      displayOrder: input.displayOrder,
      scopeType: input.scopeType,
      siteId: input.siteId ?? null,
      rigId: input.rigId ?? null,
      departmentId: input.departmentId ?? null,
    };
    for (const [key, item] of Object.entries(config.extra))
      values[`attr${key}`] =
        item.type === 'boolean'
          ? input.attributes[key]
            ? 'Y'
            : 'N'
          : (input.attributes[key] ?? null);
    return values;
  }

  private bindName(config: EntityConfig, column: string): string {
    if (column === config.code) return 'codeValue';
    if (column === config.name) return 'nameValue';
    if (column === config.description) return 'descriptionValue';
    const standard: Record<string, string> = {
      DISPLAY_ORDER: 'displayOrder',
      SCOPE_TYPE: 'scopeType',
      SITE_ID: 'siteId',
      RIG_ID: 'rigId',
      DEPARTMENT_ID: 'departmentId',
      CREATED_BY: 'actor',
      UPDATED_BY: 'actor',
    };
    if (standard[column]) return standard[column];
    const entry = Object.entries(config.extra).find(([, item]) => item.column === column);
    return `attr${entry?.[0] ?? column}`;
  }
}
