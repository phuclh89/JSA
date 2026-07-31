import { Injectable } from '@nestjs/common';
import type {
  JsaBrowseItem,
  JsaBrowseResult,
  JsaSearchField,
  JsaVersionStatus,
} from '@jsams/shared-types';
import oracledb from 'oracledb';
import {
  ResourceNotFoundError,
  StateConflictError,
} from '../../../common/errors/application-errors';
import { assertOracleId } from '../../../common/oracle/oracle-id';
import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import type { JsaBrowseRepository } from '../domain/jsa-browse.repository';
import type { JsaBrowseQuery } from '../domain/jsa-browse.types';

type Row = Record<string, any>;
const options = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const searchableFields: Exclude<JsaSearchField, 'ALL'>[] = [
  'JSA_NUMBER',
  'JOB_TITLE',
  'TASK',
  'HAZARD',
  'CONTROL',
  'PROMPT',
  'CREATOR',
  'APPROVER',
];

@Injectable()
export class OracleJsaBrowseRepository implements JsaBrowseRepository {
  async browse(context: OracleTransactionContext, query: JsaBrowseQuery): Promise<JsaBrowseResult> {
    const binds: Record<string, any> = {
      userId: query.userId,
      offset: (query.page - 1) * query.pageSize,
      pageSize: query.pageSize,
    };
    const conditions = [scopePredicate()];
    addOptionalFilters(conditions, binds, query);
    conditions.push(kindPredicate(query.kind));

    if (query.keyword) {
      binds.searchPattern = query.searchPattern;
      const requested =
        query.searchField === 'ALL'
          ? searchableFields.map((field) => fieldExpression(field, 'V')).join(' OR ')
          : fieldExpression(query.searchField, 'V');
      const workingMatch =
        query.kind === 'all'
          ? ` OR EXISTS (
              SELECT 1 FROM JSA_VERSION WV
               WHERE WV.JSA_VERSION_ID=M.WORKING_VERSION_ID
                 AND ${workingVisibility()}
                 AND (${
                   query.searchField === 'ALL'
                     ? searchableFields.map((field) => fieldExpression(field, 'WV')).join(' OR ')
                     : fieldExpression(query.searchField, 'WV')
                 })
            )`
          : '';
      conditions.push(`((${requested})${workingMatch})`);
    }

    const matchFor = (field: Exclude<JsaSearchField, 'ALL'>) =>
      query.kind === 'all'
        ? `((${fieldExpression(field, 'CV')})
          OR (M.WORKING_VERSION_ID IS NOT NULL AND ${workingVisibility()}
            AND (${fieldExpression(field, 'WV0')})))`
        : `(${fieldExpression(field, 'V')})`;
    const fieldFlags = searchableFields
      .map(
        (field) =>
          `CASE WHEN :hasKeyword=1 AND ${matchFor(field)} THEN 1 ELSE 0 END MATCH_${field}`,
      )
      .join(',\n');
    binds.hasKeyword = query.keyword ? 1 : 0;
    if (!query.keyword) binds.searchPattern = null;

    const from = fromClause(query.kind);
    const where = conditions.join('\n AND ');
    const order = sortClause(query.sort, query.direction);
    const select = `
      SELECT TO_CHAR(M.JSA_ID) JSA_ID,TO_CHAR(V.JSA_VERSION_ID) VERSION_ID,
             M.JSA_NUMBER,V.JOB_TITLE,TO_CHAR(M.OWNER_SITE_ID) OWNER_SITE_ID,
             SI.SITE_CODE,SI.SITE_NAME,TO_CHAR(M.RIG_ID) RIG_ID,R.RIG_CODE,R.RIG_NAME,
             TO_CHAR(M.DEPARTMENT_ID) DEPARTMENT_ID,D.DEPARTMENT_CODE,D.DEPARTMENT_NAME,
             CV.VERSION_STATUS CURRENT_STATUS,WV0.VERSION_STATUS WORKING_STATUS,
             V.VERSION_STATUS DISPLAY_STATUS,TO_CHAR(V.MATRIX_VERSION_ID) MATRIX_VERSION_ID,
             CU.USERNAME CREATOR_USERNAME,V.PUBLISHED_BY_USERNAME,
             (SELECT MAX(S.STEP_NAME) KEEP (DENSE_RANK LAST ORDER BY T.ASSIGNED_AT)
                FROM JSA_WORKFLOW_INSTANCE I
                JOIN JSA_WORKFLOW_TASK T ON T.INSTANCE_ID=I.INSTANCE_ID
                 AND T.CYCLE_NUMBER=I.CYCLE_NUMBER AND T.TASK_STATUS='PENDING'
                JOIN JSA_WORKFLOW_STEP S ON S.STEP_ID=T.STEP_ID
               WHERE I.JSA_ID=M.JSA_ID AND I.JSA_VERSION_ID=V.JSA_VERSION_ID) CURRENT_STEP_NAME,
             V.CREATED_AT,V.PUBLISHED_AT,V.UPDATED_AT,
             (SELECT COUNT(*) FROM JSA_TRANSLATION TR
               WHERE TR.JSA_ID=M.JSA_ID
                 AND TR.SOURCE_JSA_VERSION_ID=V.JSA_VERSION_ID
                 AND TR.TRANSLATION_STATUS='PUBLISHED') PUBLISHED_TRANSLATION_COUNT,
             CASE WHEN EXISTS(
               SELECT 1 FROM JSA_USER_FAVORITE F
                WHERE F.USER_ID=:userId AND F.JSA_ID=M.JSA_ID AND F.IS_ACTIVE='Y'
             ) THEN 1 ELSE 0 END FAVORITE_FLAG,
             ${versionMatchFlags(query)},
             ${fieldFlags}
        ${from}
       WHERE ${where}`;
    const countBinds = { ...binds };
    delete countBinds.offset;
    delete countBinds.pageSize;
    const countResult = await context.connection.execute<Row>(
      `SELECT COUNT(*) TOTAL_COUNT FROM (${select})`,
      countBinds,
      options,
    );
    const rowsResult = await context.connection.execute<Row>(
      `${select} ORDER BY ${order} OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY`,
      binds,
      options,
    );
    return {
      items: (rowsResult.rows ?? []).map(mapRow),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(countResult.rows?.[0]?.TOTAL_COUNT ?? 0),
    };
  }

  async favoriteCount(context: OracleTransactionContext, userId: string, rigId?: string) {
    if (rigId) assertOracleId(rigId, 'rigId');
    const result = await context.connection.execute<Row>(
      `SELECT COUNT(*) C
         FROM JSA_USER_FAVORITE F
         JOIN JSA_MASTER M ON M.JSA_ID=F.JSA_ID
         JOIN JSA_VERSION V ON V.JSA_VERSION_ID=M.CURRENT_VERSION_ID
        WHERE F.USER_ID=:userId AND F.IS_ACTIVE='Y'
          AND M.LIFECYCLE_STATUS='PUBLISHED' AND V.VERSION_STATUS='PUBLISHED'
          AND (:rigId IS NULL OR M.RIG_ID=:rigId)
          AND ${scopePredicate()}`,
      { userId, rigId: rigId ?? null },
      options,
    );
    return Number(result.rows?.[0]?.C ?? 0);
  }

  async allCount(context: OracleTransactionContext, userId: string, rigId?: string) {
    if (rigId) assertOracleId(rigId, 'rigId');
    const result = await context.connection.execute<Row>(
      `SELECT COUNT(*) C FROM JSA_MASTER M
        WHERE (:rigId IS NULL OR M.RIG_ID=:rigId)
          AND ${scopePredicate()}
          AND (M.CURRENT_VERSION_ID IS NOT NULL
            OR (M.WORKING_VERSION_ID IS NOT NULL AND ${workingVisibility()}))`,
      { userId, rigId: rigId ?? null },
      options,
    );
    return Number(result.rows?.[0]?.C ?? 0);
  }

  async facets(context: OracleTransactionContext, userId: string, rigId?: string) {
    if (rigId) assertOracleId(rigId, 'rigId');
    const rows = await context.connection.execute<Row>(
      `SELECT FACET_KIND,TO_CHAR(FACET_ID) FACET_ID,FACET_CODE,FACET_NAME
       FROM (
         SELECT DISTINCT 'SITE' FACET_KIND,SI.SITE_ID FACET_ID,
                SI.SITE_CODE FACET_CODE,SI.SITE_NAME FACET_NAME
           FROM JSA_MASTER M JOIN SYS_SITE SI ON SI.SITE_ID=M.OWNER_SITE_ID
          WHERE (:rigId IS NULL OR M.RIG_ID=:rigId) AND ${scopePredicate()}
            AND (M.CURRENT_VERSION_ID IS NOT NULL
              OR (M.WORKING_VERSION_ID IS NOT NULL AND ${workingVisibility()}))
         UNION ALL
         SELECT DISTINCT 'DEPARTMENT',D.DEPARTMENT_ID,D.DEPARTMENT_CODE,D.DEPARTMENT_NAME
           FROM JSA_MASTER M JOIN SYS_DEPARTMENT D ON D.DEPARTMENT_ID=M.DEPARTMENT_ID
          WHERE (:rigId IS NULL OR M.RIG_ID=:rigId) AND ${scopePredicate()}
            AND (M.CURRENT_VERSION_ID IS NOT NULL
              OR (M.WORKING_VERSION_ID IS NOT NULL AND ${workingVisibility()}))
         UNION ALL
         SELECT DISTINCT 'MATRIX',MV.MATRIX_VERSION_ID,MV.VERSION_CODE,
                RM.MATRIX_NAME||' — '||MV.VERSION_CODE
           FROM JSA_MASTER M
           JOIN JSA_VERSION V ON V.JSA_VERSION_ID=COALESCE(M.CURRENT_VERSION_ID,M.WORKING_VERSION_ID)
           JOIN JSA_RISK_MATRIX_VERSION MV ON MV.MATRIX_VERSION_ID=V.MATRIX_VERSION_ID
           JOIN JSA_RISK_MATRIX RM ON RM.MATRIX_ID=MV.MATRIX_ID
          WHERE (:rigId IS NULL OR M.RIG_ID=:rigId) AND ${scopePredicate()}
            AND (M.CURRENT_VERSION_ID IS NOT NULL
              OR (M.WORKING_VERSION_ID IS NOT NULL AND ${workingVisibility()}))
       ) ORDER BY FACET_KIND,FACET_NAME,FACET_ID`,
      { userId, rigId: rigId ?? null },
      options,
    );
    const result = { sites: [], departments: [], matrixVersions: [] } as {
      sites: Array<{ id: string; code: string; name: string }>;
      departments: Array<{ id: string; code: string; name: string }>;
      matrixVersions: Array<{ id: string; code: string; name: string }>;
    };
    for (const row of rows.rows ?? []) {
      const item = { id: row.FACET_ID, code: row.FACET_CODE, name: row.FACET_NAME };
      if (row.FACET_KIND === 'SITE') result.sites.push(item);
      else if (row.FACET_KIND === 'DEPARTMENT') result.departments.push(item);
      else result.matrixVersions.push(item);
    }
    return result;
  }

  async setFavorite(
    context: OracleTransactionContext,
    input: {
      jsaId: string;
      userId: string;
      username: string;
      localSiteId: string;
      active: boolean;
    },
  ) {
    const visible = await context.connection.execute<Row>(
      `SELECT TO_CHAR(M.JSA_ID) JSA_ID
         FROM JSA_MASTER M
         JOIN JSA_VERSION V ON V.JSA_VERSION_ID=M.CURRENT_VERSION_ID
        WHERE M.JSA_ID=:jsaId AND M.LIFECYCLE_STATUS='PUBLISHED'
          AND V.VERSION_STATUS='PUBLISHED' AND ${scopePredicate()}`,
      { jsaId: input.jsaId, userId: input.userId },
      options,
    );
    if (!visible.rows?.[0]) throw new ResourceNotFoundError('Current Published JSA was not found');

    const existing = await context.connection.execute<Row>(
      `SELECT TO_CHAR(FAVORITE_ID) FAVORITE_ID,IS_ACTIVE
         FROM JSA_USER_FAVORITE
        WHERE USER_ID=:userId AND JSA_ID=:jsaId FOR UPDATE`,
      { userId: input.userId, jsaId: input.jsaId },
      options,
    );
    const row = existing.rows?.[0];
    if (row?.IS_ACTIVE === (input.active ? 'Y' : 'N')) return false;
    if (row) {
      const updated = await context.connection.execute(
        `UPDATE JSA_USER_FAVORITE
            SET IS_ACTIVE=:active,
                FAVORITED_AT=CASE WHEN :active='Y' THEN SYSTIMESTAMP ELSE FAVORITED_AT END,
                UNFAVORITED_AT=CASE WHEN :active='N' THEN SYSTIMESTAMP ELSE NULL END,
                UPDATED_SITE_ID=:siteId,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,
                ROW_VERSION=ROW_VERSION+1
          WHERE FAVORITE_ID=:favoriteId`,
        {
          active: input.active ? 'Y' : 'N',
          siteId: input.localSiteId,
          actor: input.username,
          favoriteId: row.FAVORITE_ID,
        },
      );
      if (updated.rowsAffected !== 1) throw new StateConflictError('Favorite could not be updated');
      return true;
    }
    if (!input.active) return false;
    try {
      await context.connection.execute(
        `INSERT INTO JSA_USER_FAVORITE
         (FAVORITE_ID,USER_ID,JSA_ID,IS_ACTIVE,FAVORITED_AT,CREATED_SITE_ID,UPDATED_SITE_ID,
          CREATED_BY,UPDATED_BY)
         VALUES(SEQ_JSA_USER_FAVORITE.NEXTVAL,:userId,:jsaId,'Y',SYSTIMESTAMP,:siteId,:siteId,
                :actor,:actor)`,
        {
          userId: input.userId,
          jsaId: input.jsaId,
          siteId: input.localSiteId,
          actor: input.username,
        },
      );
    } catch (error) {
      if ((error as { errorNum?: number }).errorNum !== 1) throw error;
      const concurrent = await context.connection.execute<Row>(
        `SELECT IS_ACTIVE FROM JSA_USER_FAVORITE
          WHERE USER_ID=:userId AND JSA_ID=:jsaId`,
        { userId: input.userId, jsaId: input.jsaId },
        options,
      );
      if (concurrent.rows?.[0]?.IS_ACTIVE === 'Y') return false;
      throw error;
    }
    return true;
  }
}

function fromClause(kind: JsaBrowseQuery['kind']) {
  const version =
    kind === 'published' || kind === 'favorites' || kind === 'all'
      ? 'COALESCE(M.CURRENT_VERSION_ID,M.WORKING_VERSION_ID)'
      : 'M.WORKING_VERSION_ID';
  return `FROM JSA_MASTER M
    JOIN JSA_VERSION V ON V.JSA_VERSION_ID=${version}
    LEFT JOIN JSA_VERSION CV ON CV.JSA_VERSION_ID=M.CURRENT_VERSION_ID
    LEFT JOIN JSA_VERSION WV0 ON WV0.JSA_VERSION_ID=M.WORKING_VERSION_ID
    JOIN SYS_SITE SI ON SI.SITE_ID=M.OWNER_SITE_ID
    JOIN SYS_RIG R ON R.RIG_ID=M.RIG_ID AND R.SITE_ID=M.OWNER_SITE_ID
    JOIN SYS_DEPARTMENT D ON D.DEPARTMENT_ID=M.DEPARTMENT_ID
      AND D.RIG_ID=M.RIG_ID AND D.SITE_ID=M.OWNER_SITE_ID
    JOIN SYS_USER CU ON CU.USER_ID=M.CREATOR_USER_ID`;
}

function scopePredicate() {
  return `EXISTS(
    SELECT 1 FROM SYS_USER_DATA_SCOPE DS
     WHERE DS.USER_ID=:userId AND DS.IS_ACTIVE='Y' AND DS.CAN_VIEW='Y'
       AND DS.EFFECTIVE_FROM<=SYSTIMESTAMP
       AND (DS.EFFECTIVE_TO IS NULL OR DS.EFFECTIVE_TO>=SYSTIMESTAMP)
       AND DS.SITE_ID=M.OWNER_SITE_ID
       AND (DS.SCOPE_TYPE='SITE'
         OR (DS.SCOPE_TYPE='RIG' AND DS.RIG_ID=M.RIG_ID)
         OR (DS.SCOPE_TYPE='DEPARTMENT' AND DS.DEPARTMENT_ID=M.DEPARTMENT_ID
           AND (DS.RIG_ID IS NULL OR DS.RIG_ID=M.RIG_ID))))`;
}

function workingVisibility() {
  return `(NVL(M.CHECKED_OUT_BY_USER_ID,M.CREATOR_USER_ID)=:userId
    OR EXISTS(
      SELECT 1 FROM JSA_WORKFLOW_INSTANCE WVI
      JOIN JSA_WORKFLOW_TASK WVT ON WVT.INSTANCE_ID=WVI.INSTANCE_ID
       AND WVT.CYCLE_NUMBER=WVI.CYCLE_NUMBER
       AND WVT.TASK_STATUS='PENDING' AND WVT.ASSIGNEE_USER_ID=:userId
      WHERE WVI.JSA_ID=M.JSA_ID AND WVI.JSA_VERSION_ID=M.WORKING_VERSION_ID
    ))`;
}

function kindPredicate(kind: JsaBrowseQuery['kind']) {
  const owner = `NVL(M.CHECKED_OUT_BY_USER_ID,M.CREATOR_USER_ID)=:userId`;
  switch (kind) {
    case 'published':
      return `M.LIFECYCLE_STATUS='PUBLISHED' AND V.VERSION_STATUS='PUBLISHED'
        AND V.JSA_VERSION_ID=M.CURRENT_VERSION_ID`;
    case 'favorites':
      return `M.LIFECYCLE_STATUS='PUBLISHED' AND V.VERSION_STATUS='PUBLISHED'
        AND V.JSA_VERSION_ID=M.CURRENT_VERSION_ID
        AND EXISTS(SELECT 1 FROM JSA_USER_FAVORITE F
          WHERE F.USER_ID=:userId AND F.JSA_ID=M.JSA_ID AND F.IS_ACTIVE='Y')`;
    case 'all':
      return `(M.CURRENT_VERSION_ID IS NOT NULL
        OR (M.WORKING_VERSION_ID IS NOT NULL AND ${workingVisibility()}))`;
    case 'drafts':
      return `M.WORKING_VERSION_ID=V.JSA_VERSION_ID AND ${owner}
        AND V.VERSION_STATUS IN ('DRAFT','RETURNED')`;
    case 'approvals':
      return `M.WORKING_VERSION_ID=V.JSA_VERSION_ID
        AND EXISTS(SELECT 1 FROM JSA_WORKFLOW_INSTANCE I
          JOIN JSA_WORKFLOW_TASK T ON T.INSTANCE_ID=I.INSTANCE_ID
           AND T.CYCLE_NUMBER=I.CYCLE_NUMBER
          WHERE I.JSA_ID=M.JSA_ID AND I.JSA_VERSION_ID=V.JSA_VERSION_ID
           AND T.ASSIGNEE_USER_ID=:userId AND T.TASK_STATUS='PENDING')`;
    case 'pending':
      return `M.WORKING_VERSION_ID=V.JSA_VERSION_ID AND ${owner}
        AND EXISTS(SELECT 1 FROM JSA_WORKFLOW_INSTANCE I
          WHERE I.JSA_ID=M.JSA_ID AND I.JSA_VERSION_ID=V.JSA_VERSION_ID
            AND I.INSTANCE_STATUS IN ('ACTIVE','RETURNED'))`;
    case 'rejected':
      return `M.WORKING_VERSION_ID=V.JSA_VERSION_ID AND ${owner}
        AND EXISTS(SELECT 1 FROM JSA_WORKFLOW_INSTANCE I
          WHERE I.JSA_ID=M.JSA_ID AND I.JSA_VERSION_ID=V.JSA_VERSION_ID
            AND I.INSTANCE_STATUS='REJECTED')`;
  }
}

function fieldExpression(field: Exclude<JsaSearchField, 'ALL'>, alias: string) {
  const like = (value: string) => `UPPER(${value}) LIKE :searchPattern ESCAPE '\\'`;
  switch (field) {
    case 'JSA_NUMBER':
      return like('M.JSA_NUMBER');
    case 'JOB_TITLE':
      return like(`${alias}.JOB_TITLE`);
    case 'TASK':
      return `EXISTS(SELECT 1 FROM JSA_VERSION_TASK ST
        WHERE ST.JSA_VERSION_ID=${alias}.JSA_VERSION_ID AND ST.IS_ACTIVE='Y'
          AND (${like('ST.TASK_TITLE')} OR ${like('DBMS_LOB.SUBSTR(ST.TASK_DESCRIPTION,4000,1)')}))`;
    case 'HAZARD':
      return `EXISTS(SELECT 1 FROM JSA_VERSION_HAZARD SH
        WHERE SH.JSA_VERSION_ID=${alias}.JSA_VERSION_ID AND SH.IS_ACTIVE='Y'
          AND ${like('SH.HAZARD_TEXT')})`;
    case 'CONTROL':
      return `EXISTS(SELECT 1 FROM JSA_VERSION_CONTROL SC
        WHERE SC.JSA_VERSION_ID=${alias}.JSA_VERSION_ID AND SC.IS_ACTIVE='Y'
          AND ${like('SC.CONTROL_TEXT')})`;
    case 'PROMPT':
      return `EXISTS(SELECT 1 FROM JSA_VERSION_PROMPT SP
        WHERE SP.JSA_VERSION_ID=${alias}.JSA_VERSION_ID AND SP.IS_ACTIVE='Y'
          AND SP.SELECTED_FLAG='Y' AND ${like('SP.PROMPT_LABEL_SNAPSHOT')})`;
    case 'CREATOR':
      return `(${like('CU.USERNAME')} OR ${like('CU.DISPLAY_NAME')})`;
    case 'APPROVER':
      return `(${like(`${alias}.PUBLISHED_BY_USERNAME`)}
        OR EXISTS(SELECT 1 FROM JSA_WORKFLOW_INSTANCE AI
          JOIN JSA_WORKFLOW_ACTION AA ON AA.INSTANCE_ID=AI.INSTANCE_ID
          WHERE AI.JSA_VERSION_ID=${alias}.JSA_VERSION_ID
            AND (${like('AA.ACTOR_USERNAME')} OR ${like('AA.ACTOR_DISPLAY_NAME_SNAPSHOT')})))`;
  }
}

function versionMatchFlags(query: JsaBrowseQuery) {
  const match = (alias: string) =>
    query.searchField === 'ALL'
      ? searchableFields.map((field) => fieldExpression(field, alias)).join(' OR ')
      : fieldExpression(query.searchField, alias);
  if (query.kind === 'all')
    return `CASE WHEN M.CURRENT_VERSION_ID IS NOT NULL
                  AND (:hasKeyword=0 OR (${match('CV')})) THEN 1 ELSE 0 END MATCH_CURRENT,
            CASE WHEN M.WORKING_VERSION_ID IS NOT NULL AND ${workingVisibility()}
                  AND (:hasKeyword=0 OR (${match('WV0')})) THEN 1 ELSE 0 END MATCH_WORKING`;
  return `CASE WHEN V.JSA_VERSION_ID=M.CURRENT_VERSION_ID
                AND (:hasKeyword=0 OR (${match('V')})) THEN 1 ELSE 0 END MATCH_CURRENT,
          CASE WHEN V.JSA_VERSION_ID=M.WORKING_VERSION_ID
                AND (:hasKeyword=0 OR (${match('V')})) THEN 1 ELSE 0 END MATCH_WORKING`;
}

function addOptionalFilters(
  conditions: string[],
  binds: Record<string, any>,
  query: JsaBrowseQuery,
) {
  const direct: Array<[unknown, string, string]> = [
    [query.rigId, 'rigId', 'M.RIG_ID=:rigId'],
    [query.siteId, 'siteId', 'M.OWNER_SITE_ID=:siteId'],
    [query.departmentId, 'departmentId', 'M.DEPARTMENT_ID=:departmentId'],
    [query.matrixVersionId, 'matrixVersionId', 'V.MATRIX_VERSION_ID=:matrixVersionId'],
    [query.officialStatus, 'officialStatus', 'M.NUMBER_STATUS=:officialStatus'],
    [query.workingStatus, 'workingStatus', 'WV0.VERSION_STATUS=:workingStatus'],
  ];
  for (const [value, name, condition] of direct)
    if (value !== undefined) {
      binds[name] = value;
      conditions.push(condition);
    }
  if (query.activeUpdate !== undefined) {
    binds.activeUpdate = query.activeUpdate ? 1 : 0;
    conditions.push(
      query.activeUpdate ? 'M.WORKING_VERSION_ID IS NOT NULL' : 'M.WORKING_VERSION_ID IS NULL',
    );
  }
  if (query.favorite !== undefined) {
    const exists = `EXISTS(SELECT 1 FROM JSA_USER_FAVORITE FF
      WHERE FF.USER_ID=:userId AND FF.JSA_ID=M.JSA_ID AND FF.IS_ACTIVE='Y')`;
    conditions.push(query.favorite ? exists : `NOT ${exists}`);
  }
  const dates: Array<[Date | undefined, string, string]> = [
    [query.createdFrom, 'createdFrom', 'V.CREATED_AT>=:createdFrom'],
    [query.createdTo, 'createdTo', "V.CREATED_AT<CAST(:createdTo AS TIMESTAMP)+INTERVAL '1' DAY"],
    [query.publishedFrom, 'publishedFrom', 'V.PUBLISHED_AT>=:publishedFrom'],
    [
      query.publishedTo,
      'publishedTo',
      "V.PUBLISHED_AT<CAST(:publishedTo AS TIMESTAMP)+INTERVAL '1' DAY",
    ],
    [query.updatedFrom, 'updatedFrom', 'V.UPDATED_AT>=:updatedFrom'],
    [query.updatedTo, 'updatedTo', "V.UPDATED_AT<CAST(:updatedTo AS TIMESTAMP)+INTERVAL '1' DAY"],
  ];
  for (const [value, name, condition] of dates)
    if (value) {
      binds[name] = value;
      conditions.push(condition);
    }
  if (query.creator) {
    binds.creator = `%${query.creator.replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push(
      `(UPPER(CU.USERNAME) LIKE :creator ESCAPE '\\'
        OR UPPER(CU.DISPLAY_NAME) LIKE :creator ESCAPE '\\')`,
    );
  }
  if (query.approver) {
    binds.approver = `%${query.approver.replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push(`EXISTS(SELECT 1 FROM JSA_WORKFLOW_INSTANCE FI
      JOIN JSA_WORKFLOW_ACTION FA ON FA.INSTANCE_ID=FI.INSTANCE_ID
      WHERE FI.JSA_VERSION_ID=V.JSA_VERSION_ID
        AND (UPPER(FA.ACTOR_USERNAME) LIKE :approver ESCAPE '\\'
          OR UPPER(FA.ACTOR_DISPLAY_NAME_SNAPSHOT) LIKE :approver ESCAPE '\\'))`);
  }
  if (query.riskResult) {
    binds.riskResult = query.riskResult;
    const initial = `(UPPER(H.INITIAL_RESULT_CODE)=:riskResult OR UPPER(H.INITIAL_RESULT_NAME)=:riskResult)`;
    const residual = `(UPPER(H.RESIDUAL_RESULT_CODE)=:riskResult OR UPPER(H.RESIDUAL_RESULT_NAME)=:riskResult)`;
    const risk =
      query.riskStage === 'INITIAL'
        ? initial
        : query.riskStage === 'RESIDUAL'
          ? residual
          : `(${initial} OR ${residual})`;
    conditions.push(`EXISTS(SELECT 1 FROM JSA_VERSION_HAZARD H
      WHERE H.JSA_VERSION_ID=V.JSA_VERSION_ID AND H.IS_ACTIVE='Y' AND ${risk})`);
  }
}

function sortClause(sort: JsaBrowseQuery['sort'], direction: 'asc' | 'desc') {
  const columns = {
    updatedAt: 'V.UPDATED_AT',
    createdAt: 'V.CREATED_AT',
    publishedAt: 'V.PUBLISHED_AT',
    jsaNumber: 'UPPER(M.JSA_NUMBER)',
    jobTitle: 'UPPER(V.JOB_TITLE)',
  };
  return `${columns[sort]} ${direction.toUpperCase()} NULLS LAST,M.JSA_ID ${direction.toUpperCase()}`;
}

function mapRow(row: Row): JsaBrowseItem {
  const matchedFields = searchableFields.filter((field) => Number(row[`MATCH_${field}`]) === 1);
  const matchedVersionKinds: Array<'CURRENT' | 'WORKING'> = [];
  if (Number(row.MATCH_CURRENT) === 1) matchedVersionKinds.push('CURRENT');
  if (Number(row.MATCH_WORKING) === 1) matchedVersionKinds.push('WORKING');
  return {
    jsaId: row.JSA_ID,
    versionId: row.VERSION_ID,
    jsaNumber: row.JSA_NUMBER,
    ...(row.JOB_TITLE ? { jobTitle: row.JOB_TITLE } : {}),
    ownerSiteId: row.OWNER_SITE_ID,
    ownerSiteCode: row.SITE_CODE,
    ownerSiteName: row.SITE_NAME,
    rigId: row.RIG_ID,
    rigCode: row.RIG_CODE,
    rigName: row.RIG_NAME,
    departmentId: row.DEPARTMENT_ID,
    departmentCode: row.DEPARTMENT_CODE,
    departmentName: row.DEPARTMENT_NAME,
    ...(row.CURRENT_STATUS ? { currentStatus: row.CURRENT_STATUS as JsaVersionStatus } : {}),
    ...(row.WORKING_STATUS ? { workingStatus: row.WORKING_STATUS as JsaVersionStatus } : {}),
    displayStatus: row.DISPLAY_STATUS,
    matrixVersionId: row.MATRIX_VERSION_ID,
    creatorUsername: row.CREATOR_USERNAME,
    ...(row.PUBLISHED_BY_USERNAME ? { publishedByUsername: row.PUBLISHED_BY_USERNAME } : {}),
    ...(row.CURRENT_STEP_NAME ? { currentStepName: row.CURRENT_STEP_NAME } : {}),
    createdAt: row.CREATED_AT,
    ...(row.PUBLISHED_AT ? { publishedAt: row.PUBLISHED_AT } : {}),
    updatedAt: row.UPDATED_AT,
    favorite: Number(row.FAVORITE_FLAG) === 1,
    publishedTranslationCount: Number(row.PUBLISHED_TRANSLATION_COUNT ?? 0),
    matchedFields,
    matchedVersionKinds,
  };
}
