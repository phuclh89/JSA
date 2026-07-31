import { Injectable } from '@nestjs/common';
import type {
  PublishedTranslationOption,
  TranslationAction,
  TranslationCandidate,
  TranslationDetail,
  TranslationListItem,
  TranslationNavigationCounts,
  TranslationStatus,
} from '@jsams/shared-types';
import { createHash } from 'node:crypto';
import oracledb from 'oracledb';
import { OptimisticLockError, StateConflictError } from '../../../common/errors/application-errors';
import { assertOracleId } from '../../../common/oracle/oracle-id';
import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import type { JsaTranslationRepository } from '../domain/jsa-translation.repository';
import type {
  TranslationActor,
  TranslationListQuery,
  TranslationRecord,
  TranslationSegmentSeed,
  TranslationSource,
} from '../domain/jsa-translation.types';

type Row = Record<string, any>;
const options = { outFormat: oracledb.OUT_FORMAT_OBJECT };

@Injectable()
export class OracleJsaTranslationRepository implements JsaTranslationRepository {
  async source(context: OracleTransactionContext, jsaId: string, lock = false) {
    assertOracleId(jsaId, 'jsaId');
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(M.JSA_ID) JSA_ID,TO_CHAR(M.CURRENT_VERSION_ID) CURRENT_VERSION_ID,
        M.JSA_NUMBER,M.LIFECYCLE_STATUS,TO_CHAR(M.OWNER_SITE_ID) SITE_ID,
        TO_CHAR(M.RIG_ID) RIG_ID,TO_CHAR(M.DEPARTMENT_ID) DEPARTMENT_ID,
        TO_CHAR(V.JSA_VERSION_ID) VERSION_ID,V.VERSION_NUMBER,V.VERSION_LABEL,V.VERSION_STATUS,
        V.JOB_TITLE,TO_CHAR(V.LANGUAGE_ID) LANGUAGE_ID,L.LANGUAGE_CODE
       FROM JSA_MASTER M
       LEFT JOIN JSA_VERSION V ON V.JSA_VERSION_ID=M.CURRENT_VERSION_ID AND V.JSA_ID=M.JSA_ID
       LEFT JOIN SYS_LANGUAGE L ON L.LANGUAGE_ID=V.LANGUAGE_ID
       WHERE M.JSA_ID=:id${lock ? ' FOR UPDATE OF M.ROW_VERSION' : ''}`,
      { id: jsaId },
      options,
    );
    const row = result.rows?.[0];
    if (!row) return undefined;
    return {
      jsaId: row.JSA_ID,
      versionId: row.VERSION_ID ?? '',
      currentVersionId: row.CURRENT_VERSION_ID ?? '',
      jsaNumber: row.JSA_NUMBER,
      ...(row.JOB_TITLE ? { jobTitle: row.JOB_TITLE } : {}),
      versionNumber: row.VERSION_NUMBER ?? 0,
      ...(row.VERSION_LABEL ? { versionLabel: row.VERSION_LABEL } : {}),
      versionStatus: row.VERSION_STATUS ?? '',
      lifecycleStatus: row.LIFECYCLE_STATUS,
      sourceLanguageId: row.LANGUAGE_ID ?? '',
      sourceLanguageCode: row.LANGUAGE_CODE ?? '',
      siteId: row.SITE_ID,
      rigId: row.RIG_ID,
      departmentId: row.DEPARTMENT_ID,
    } satisfies TranslationSource;
  }

  async translation(context: OracleTransactionContext, id: string, lock = false) {
    assertOracleId(id, 'translationId');
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(TRANSLATION_ID) TRANSLATION_ID,TO_CHAR(JSA_ID) JSA_ID,
        TO_CHAR(SOURCE_JSA_VERSION_ID) SOURCE_VERSION_ID,TRANSLATION_STATUS,
        TRANSLATION_CYCLE,TO_CHAR(TRANSLATOR_USER_ID) TRANSLATOR_USER_ID,
        TO_CHAR(CURRENT_ASSIGNEE_USER_ID) CURRENT_ASSIGNEE_USER_ID,
        TO_CHAR(STC_REVIEWER_USER_ID) STC_REVIEWER_USER_ID,
        TO_CHAR(ASSIGNED_BY_USER_ID) ASSIGNED_BY_USER_ID,
        TO_CHAR(OWNER_SITE_ID) SITE_ID,TO_CHAR(RIG_ID) RIG_ID,
        TO_CHAR(DEPARTMENT_ID) DEPARTMENT_ID,TO_CHAR(ROW_VERSION) ROW_VERSION
       FROM JSA_TRANSLATION WHERE TRANSLATION_ID=:id${lock ? ' FOR UPDATE' : ''}`,
      { id },
      options,
    );
    const row = result.rows?.[0];
    if (!row) return undefined;
    return {
      translationId: row.TRANSLATION_ID,
      jsaId: row.JSA_ID,
      sourceVersionId: row.SOURCE_VERSION_ID,
      status: row.TRANSLATION_STATUS,
      cycleNumber: row.TRANSLATION_CYCLE,
      translatorUserId: row.TRANSLATOR_USER_ID,
      ...(row.CURRENT_ASSIGNEE_USER_ID
        ? { currentAssigneeUserId: row.CURRENT_ASSIGNEE_USER_ID }
        : {}),
      ...(row.STC_REVIEWER_USER_ID ? { stcReviewerUserId: row.STC_REVIEWER_USER_ID } : {}),
      assignedByUserId: row.ASSIGNED_BY_USER_ID,
      siteId: row.SITE_ID,
      rigId: row.RIG_ID,
      departmentId: row.DEPARTMENT_ID,
      rowVersion: row.ROW_VERSION,
    } satisfies TranslationRecord;
  }

  async actorHasWorkflowRole(
    context: OracleTransactionContext,
    userId: string,
    roleCode: 'OIM' | 'TRANSLATOR' | 'STC',
    target: Pick<TranslationSource, 'siteId' | 'rigId' | 'departmentId'>,
  ) {
    assertOracleId(userId, 'userId');
    const result = await context.connection.execute<Row>(
      `SELECT COUNT(*) ITEM_COUNT FROM JSA_WF_ROLE_ASSIGNMENT A
       JOIN SYS_USER U ON U.USER_ID=A.USER_ID AND U.IS_ACTIVE='Y'
       WHERE A.USER_ID=:userId AND UPPER(A.WORKFLOW_ROLE_CODE)=:roleCode
        AND A.IS_ACTIVE='Y' AND A.EFFECTIVE_FROM<=SYSTIMESTAMP
        AND (A.EFFECTIVE_TO IS NULL OR A.EFFECTIVE_TO>SYSTIMESTAMP)
        AND A.SITE_ID=:siteId AND (A.RIG_ID IS NULL OR A.RIG_ID=:rigId)
        AND (A.DEPARTMENT_ID IS NULL OR A.DEPARTMENT_ID=:departmentId)`,
      {
        userId,
        roleCode,
        siteId: target.siteId,
        rigId: target.rigId,
        departmentId: target.departmentId,
      },
      options,
    );
    return (result.rows?.[0]?.ITEM_COUNT ?? 0) > 0;
  }

  async languages(context: OracleTransactionContext) {
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(LANGUAGE_ID) ID,LANGUAGE_CODE CODE,LANGUAGE_NAME NAME
       FROM SYS_LANGUAGE WHERE IS_ACTIVE='Y' AND UPPER(LANGUAGE_CODE)<>'EN'
       ORDER BY DISPLAY_ORDER,LANGUAGE_NAME,LANGUAGE_ID`,
      {},
      options,
    );
    return (result.rows ?? []).map((row) => ({ id: row.ID, code: row.CODE, name: row.NAME }));
  }

  async candidates(
    context: OracleTransactionContext,
    roleCode: 'TRANSLATOR' | 'STC',
    permissionCode: string,
    target: Pick<TranslationSource, 'siteId' | 'rigId' | 'departmentId'>,
  ) {
    const result = await context.connection.execute<Row>(
      `SELECT DISTINCT TO_CHAR(U.USER_ID) USER_ID,U.USERNAME,U.DISPLAY_NAME
       FROM SYS_USER U
       JOIN JSA_WF_ROLE_ASSIGNMENT A ON A.USER_ID=U.USER_ID
       WHERE U.IS_ACTIVE='Y' AND A.IS_ACTIVE='Y'
        AND UPPER(A.WORKFLOW_ROLE_CODE)=:roleCode
        AND A.EFFECTIVE_FROM<=SYSTIMESTAMP
        AND (A.EFFECTIVE_TO IS NULL OR A.EFFECTIVE_TO>SYSTIMESTAMP)
        AND A.SITE_ID=:siteId AND (A.RIG_ID IS NULL OR A.RIG_ID=:rigId)
        AND (A.DEPARTMENT_ID IS NULL OR A.DEPARTMENT_ID=:departmentId)
        AND EXISTS (
          SELECT 1 FROM SYS_USER_DATA_SCOPE DS
          WHERE DS.USER_ID=U.USER_ID AND DS.IS_ACTIVE='Y' AND DS.CAN_ACT='Y'
           AND DS.EFFECTIVE_FROM<=SYSTIMESTAMP
           AND (DS.EFFECTIVE_TO IS NULL OR DS.EFFECTIVE_TO>SYSTIMESTAMP)
           AND DS.SITE_ID=:siteId
           AND (DS.SCOPE_TYPE='SITE'
             OR (DS.SCOPE_TYPE='RIG' AND DS.RIG_ID=:rigId)
             OR (DS.SCOPE_TYPE='DEPARTMENT' AND DS.DEPARTMENT_ID=:departmentId
               AND (DS.RIG_ID IS NULL OR DS.RIG_ID=:rigId))))
        AND NOT EXISTS (
          SELECT 1 FROM SYS_USER_PERMISSION_OVERRIDE O
          JOIN SYS_PERMISSION P ON P.PERMISSION_ID=O.PERMISSION_ID
          WHERE O.USER_ID=U.USER_ID AND O.IS_ACTIVE='Y' AND O.EFFECT_CODE='DENY'
           AND P.PERMISSION_CODE=:permissionCode AND P.IS_ACTIVE='Y'
           AND O.EFFECTIVE_FROM<=SYSTIMESTAMP
           AND (O.EFFECTIVE_TO IS NULL OR O.EFFECTIVE_TO>SYSTIMESTAMP))
        AND (EXISTS (
          SELECT 1 FROM SYS_USER_PERMISSION_OVERRIDE O
          JOIN SYS_PERMISSION P ON P.PERMISSION_ID=O.PERMISSION_ID
          WHERE O.USER_ID=U.USER_ID AND O.IS_ACTIVE='Y' AND O.EFFECT_CODE='ALLOW'
           AND P.PERMISSION_CODE=:permissionCode AND P.IS_ACTIVE='Y'
           AND O.EFFECTIVE_FROM<=SYSTIMESTAMP
           AND (O.EFFECTIVE_TO IS NULL OR O.EFFECTIVE_TO>SYSTIMESTAMP))
         OR EXISTS (
          SELECT 1 FROM SYS_USER_ROLE UR
          JOIN SYS_ROLE R ON R.ROLE_ID=UR.ROLE_ID AND R.IS_ACTIVE='Y'
          JOIN SYS_ROLE_PERMISSION RP ON RP.ROLE_ID=R.ROLE_ID AND RP.IS_ACTIVE='Y'
          JOIN SYS_PERMISSION P ON P.PERMISSION_ID=RP.PERMISSION_ID AND P.IS_ACTIVE='Y'
          WHERE UR.USER_ID=U.USER_ID AND UR.IS_ACTIVE='Y'
           AND P.PERMISSION_CODE=:permissionCode))
       ORDER BY U.DISPLAY_NAME,U.USERNAME`,
      {
        roleCode,
        permissionCode,
        siteId: target.siteId,
        rigId: target.rigId,
        departmentId: target.departmentId,
      },
      options,
    );
    return (result.rows ?? []).map((row) => ({
      userId: row.USER_ID,
      username: row.USERNAME,
      displayName: row.DISPLAY_NAME,
    }));
  }

  async segmentSeeds(context: OracleTransactionContext, versionId: string) {
    assertOracleId(versionId, 'versionId');
    const result = await context.connection.execute<Row>(
      `SELECT ENTITY_TYPE,SOURCE_ENTITY_ID,SOURCE_LOGICAL_KEY,FIELD_CODE,SECTION_CODE,
        DISPLAY_ORDER,REQUIRED_FLAG,SOURCE_TEXT
       FROM (
        SELECT 'HEADER' ENTITY_TYPE,V.JSA_VERSION_ID SOURCE_ENTITY_ID,
          TO_CHAR(V.JSA_VERSION_ID) SOURCE_LOGICAL_KEY,'JOB_TITLE' FIELD_CODE,
          'GENERAL' SECTION_CODE,1 DISPLAY_ORDER,'Y' REQUIRED_FLAG,V.JOB_TITLE SOURCE_TEXT
        FROM JSA_VERSION V WHERE V.JSA_VERSION_ID=:versionId AND V.JOB_TITLE IS NOT NULL
        UNION ALL
        SELECT 'TASK',T.VERSION_TASK_ID,TO_CHAR(T.LOGICAL_KEY),'TITLE','TASKS',
          10000+T.DISPLAY_ORDER,'Y',T.TASK_TITLE
        FROM JSA_VERSION_TASK T WHERE T.JSA_VERSION_ID=:versionId AND T.IS_ACTIVE='Y'
          AND T.TASK_TITLE IS NOT NULL
        UNION ALL
        SELECT 'HAZARD',H.VERSION_HAZARD_ID,TO_CHAR(H.LOGICAL_KEY),'TEXT','HAZARDS',
          20000+H.DISPLAY_ORDER,'Y',H.HAZARD_TEXT
        FROM JSA_VERSION_HAZARD H WHERE H.JSA_VERSION_ID=:versionId AND H.IS_ACTIVE='Y'
        UNION ALL
        SELECT 'CONTROL',C.VERSION_CONTROL_ID,TO_CHAR(C.LOGICAL_KEY),'TEXT','CONTROLS',
          30000+C.DISPLAY_ORDER,'Y',C.CONTROL_TEXT
        FROM JSA_VERSION_CONTROL C WHERE C.JSA_VERSION_ID=:versionId AND C.IS_ACTIVE='Y'
        UNION ALL
        SELECT 'BASIC_STEP',B.BASIC_STEP_ID,TO_CHAR(B.LOGICAL_KEY),'TEXT','BASIC_STEPS',
          40000+B.DISPLAY_ORDER,'Y',B.STEP_TEXT
        FROM JSA_VERSION_BASIC_STEP B WHERE B.JSA_VERSION_ID=:versionId AND B.IS_ACTIVE='Y'
       ) ORDER BY SECTION_CODE,DISPLAY_ORDER,ENTITY_TYPE,SOURCE_ENTITY_ID,FIELD_CODE`,
      { versionId },
      { ...options, fetchInfo: { SOURCE_TEXT: { type: oracledb.STRING } } },
    );
    return (result.rows ?? []).map((row) => ({
      entityType: row.ENTITY_TYPE,
      sourceEntityId: String(row.SOURCE_ENTITY_ID),
      sourceLogicalKey: row.SOURCE_LOGICAL_KEY,
      fieldCode: row.FIELD_CODE,
      sectionCode: row.SECTION_CODE,
      displayOrder: row.DISPLAY_ORDER,
      required: row.REQUIRED_FLAG === 'Y',
      sourceText: row.SOURCE_TEXT,
    }));
  }

  async create(
    context: OracleTransactionContext,
    source: TranslationSource,
    targetLanguageId: string,
    translator: TranslationCandidate,
    actor: TranslationActor,
    seeds: TranslationSegmentSeed[],
    previousTranslationId: string | undefined,
    correlationId: string,
  ) {
    assertOracleId(targetLanguageId, 'targetLanguageId');
    const language = await context.connection.execute<Row>(
      `SELECT COUNT(*) ITEM_COUNT FROM SYS_LANGUAGE
       WHERE LANGUAGE_ID=:id AND IS_ACTIVE='Y' AND UPPER(LANGUAGE_CODE)<>'EN'`,
      { id: targetLanguageId },
      options,
    );
    if (language.rows?.[0]?.ITEM_COUNT !== 1)
      throw new StateConflictError('Target language is not one active non-English language');
    const id = await this.next(context, 'SEQ_JSA_TRANSLATION');
    const sourceHash = this.aggregateHash(seeds.map((seed) => this.hash(seed.sourceText)));
    await context.connection.execute(
      `INSERT INTO JSA_TRANSLATION(
        TRANSLATION_ID,JSA_ID,SOURCE_JSA_VERSION_ID,SOURCE_LANGUAGE_ID,TARGET_LANGUAGE_ID,
        PREVIOUS_TRANSLATION_ID,OWNER_SITE_ID,RIG_ID,DEPARTMENT_ID,TRANSLATOR_USER_ID,
        TRANSLATOR_USERNAME,TRANSLATOR_DISPLAY_NAME,CURRENT_ASSIGNEE_USER_ID,
        ASSIGNED_BY_USER_ID,ASSIGNED_BY_USERNAME,ASSIGNED_BY_DISPLAY_NAME,
        SOURCE_CONTENT_HASH,CREATED_SITE_ID,UPDATED_SITE_ID,CREATED_BY,UPDATED_BY)
       VALUES(:id,:jsaId,:versionId,:sourceLanguageId,:targetLanguageId,
        :previousId,:siteId,:rigId,:departmentId,:translatorId,:translatorUsername,
        :translatorName,:translatorId,:actorId,:actorUsername,:actorName,
        :sourceHash,:siteId,:siteId,:actorUsername,:actorUsername)`,
      {
        id,
        jsaId: source.jsaId,
        versionId: source.versionId,
        sourceLanguageId: source.sourceLanguageId,
        targetLanguageId,
        previousId: previousTranslationId ?? null,
        siteId: source.siteId,
        rigId: source.rigId,
        departmentId: source.departmentId,
        translatorId: translator.userId,
        translatorUsername: translator.username,
        translatorName: translator.displayName,
        actorId: actor.userId,
        actorUsername: actor.username,
        actorName: actor.displayName,
        sourceHash,
      },
    );
    for (const seed of seeds) {
      const segmentId = await this.next(context, 'SEQ_JSA_TRANSL_SEGMENT');
      await context.connection.execute(
        `INSERT INTO JSA_TRANSLATION_SEGMENT(
          TRANSLATION_SEGMENT_ID,TRANSLATION_ID,ENTITY_TYPE,SOURCE_ENTITY_ID,
          SOURCE_LOGICAL_KEY,FIELD_CODE,SECTION_CODE,DISPLAY_ORDER,REQUIRED_FLAG,
          SOURCE_TEXT,SOURCE_TEXT_HASH,CREATED_BY,UPDATED_BY)
         VALUES(:id,:translationId,:entityType,:sourceEntityId,:sourceLogicalKey,
          :fieldCode,:sectionCode,:displayOrder,:requiredFlag,:sourceText,:sourceHash,
          :actor,:actor)`,
        {
          id: segmentId,
          translationId: id,
          entityType: seed.entityType,
          sourceEntityId: seed.sourceEntityId,
          sourceLogicalKey: seed.sourceLogicalKey,
          fieldCode: seed.fieldCode,
          sectionCode: seed.sectionCode,
          displayOrder: seed.displayOrder,
          requiredFlag: seed.required ? 'Y' : 'N',
          sourceText: seed.sourceText,
          sourceHash: this.hash(seed.sourceText),
          actor: actor.username,
        },
      );
    }
    await context.connection.execute(
      `UPDATE JSA_TRANSLATION SET INVENTORY_LOCKED_FLAG='Y' WHERE TRANSLATION_ID=:id`,
      { id },
    );
    await this.action(
      context,
      id,
      'ASSIGN',
      actor,
      undefined,
      'ASSIGNED',
      1,
      undefined,
      correlationId,
    );
    await this.notify(
      context,
      translator.userId,
      'TRANSLATION_ASSIGNED',
      `Translation assigned: ${source.jsaNumber}`,
      'A new JSA translation is ready.',
      id,
      actor.username,
    );
    return id;
  }

  async list(context: OracleTransactionContext, query: TranslationListQuery) {
    assertOracleId(query.userId, 'userId');
    const predicates = {
      tasks: `T.CURRENT_ASSIGNEE_USER_ID=:userId AND T.TRANSLATION_STATUS IN ('ASSIGNED','IN_TRANSLATION','RETURNED')`,
      review: `T.CURRENT_ASSIGNEE_USER_ID=:userId AND T.TRANSLATION_STATUS='STC_REVIEW'`,
      published: `T.TRANSLATION_STATUS='PUBLISHED'`,
      outdated: `T.TRANSLATION_STATUS='OUTDATED'`,
    };
    const conditions = [
      predicates[query.kind],
      `EXISTS(
        SELECT 1 FROM SYS_USER_DATA_SCOPE DS
         WHERE DS.USER_ID=:userId AND DS.IS_ACTIVE='Y' AND DS.CAN_VIEW='Y'
           AND DS.EFFECTIVE_FROM<=SYSTIMESTAMP
           AND (DS.EFFECTIVE_TO IS NULL OR DS.EFFECTIVE_TO>=SYSTIMESTAMP)
           AND DS.SITE_ID=T.OWNER_SITE_ID
           AND (DS.SCOPE_TYPE='SITE'
             OR (DS.SCOPE_TYPE='RIG' AND DS.RIG_ID=T.RIG_ID)
             OR (DS.SCOPE_TYPE='DEPARTMENT' AND DS.DEPARTMENT_ID=T.DEPARTMENT_ID
               AND (DS.RIG_ID IS NULL OR DS.RIG_ID=T.RIG_ID))))`,
    ];
    const binds: Record<string, string | number> = {
      userId: query.userId,
      offset: (query.page - 1) * query.pageSize,
      pageSize: query.pageSize,
    };
    if (query.status) {
      conditions.push('T.TRANSLATION_STATUS=:status');
      binds.status = query.status;
    }
    if (query.assigneeUserId) {
      conditions.push('T.TRANSLATOR_USER_ID=:assigneeUserId');
      binds.assigneeUserId = query.assigneeUserId;
    }
    if (query.searchPattern) {
      conditions.push(
        `(UPPER(M.JSA_NUMBER) LIKE :searchPattern ESCAPE '\\'
          OR UPPER(V.JOB_TITLE) LIKE :searchPattern ESCAPE '\\')`,
      );
      binds.searchPattern = query.searchPattern;
    }
    const where = conditions.join(' AND ');
    const orderColumns: Record<TranslationListQuery['sort'], string> = {
      updatedAt: 'T.UPDATED_AT',
      jsaNumber: 'M.JSA_NUMBER',
      jobTitle: 'V.JOB_TITLE',
      status: 'T.TRANSLATION_STATUS',
    };
    const direction = query.direction.toUpperCase();
    const order = `${orderColumns[query.sort]} ${direction} NULLS LAST,T.TRANSLATION_ID ${direction}`;
    const countBinds = { ...binds };
    delete countBinds.offset;
    delete countBinds.pageSize;
    const count = await context.connection.execute<Row>(
      `SELECT COUNT(*) TOTAL ${this.listFrom()} WHERE ${where}`,
      countBinds,
      options,
    );
    const result = await context.connection.execute<Row>(
      `${this.listSelect()} WHERE ${where}
       ORDER BY ${order} OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY`,
      binds,
      options,
    );
    return {
      items: (result.rows ?? []).map((row) => this.listItem(row)),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(count.rows?.[0]?.TOTAL ?? 0),
    };
  }

  async publishedForJsa(
    context: OracleTransactionContext,
    jsaId: string,
    userId: string,
  ): Promise<PublishedTranslationOption[]> {
    assertOracleId(jsaId, 'jsaId');
    assertOracleId(userId, 'userId');
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(T.TRANSLATION_ID) TRANSLATION_ID,
              L.LANGUAGE_CODE TARGET_LANGUAGE_CODE,L.LANGUAGE_NAME TARGET_LANGUAGE_NAME,
              V.VERSION_NUMBER,V.VERSION_LABEL,T.PUBLISHED_AT
         FROM JSA_TRANSLATION T
         JOIN JSA_MASTER M ON M.JSA_ID=T.JSA_ID
          AND M.CURRENT_VERSION_ID=T.SOURCE_JSA_VERSION_ID
         JOIN JSA_VERSION V ON V.JSA_VERSION_ID=T.SOURCE_JSA_VERSION_ID
         JOIN SYS_LANGUAGE L ON L.LANGUAGE_ID=T.TARGET_LANGUAGE_ID AND L.IS_ACTIVE='Y'
        WHERE T.JSA_ID=:jsaId AND T.TRANSLATION_STATUS='PUBLISHED'
          AND EXISTS(
            SELECT 1 FROM SYS_USER_DATA_SCOPE DS
             WHERE DS.USER_ID=:userId AND DS.IS_ACTIVE='Y' AND DS.CAN_VIEW='Y'
               AND DS.EFFECTIVE_FROM<=SYSTIMESTAMP
               AND (DS.EFFECTIVE_TO IS NULL OR DS.EFFECTIVE_TO>=SYSTIMESTAMP)
               AND DS.SITE_ID=T.OWNER_SITE_ID
               AND (DS.SCOPE_TYPE='SITE'
                 OR (DS.SCOPE_TYPE='RIG' AND DS.RIG_ID=T.RIG_ID)
                 OR (DS.SCOPE_TYPE='DEPARTMENT' AND DS.DEPARTMENT_ID=T.DEPARTMENT_ID
                   AND (DS.RIG_ID IS NULL OR DS.RIG_ID=T.RIG_ID))))
        ORDER BY L.DISPLAY_ORDER,L.LANGUAGE_NAME,T.TRANSLATION_ID`,
      { jsaId, userId },
      options,
    );
    return (result.rows ?? []).map((row) => ({
      translationId: row.TRANSLATION_ID,
      targetLanguageCode: row.TARGET_LANGUAGE_CODE,
      targetLanguageName: row.TARGET_LANGUAGE_NAME,
      sourceVersionNumber: Number(row.VERSION_NUMBER),
      ...(row.VERSION_LABEL ? { sourceVersionLabel: row.VERSION_LABEL } : {}),
      publishedAt: this.iso(row.PUBLISHED_AT),
    }));
  }

  async detail(context: OracleTransactionContext, id: string) {
    assertOracleId(id, 'translationId');
    const header = await context.connection.execute<Row>(
      `${this.listSelect()} WHERE T.TRANSLATION_ID=:id`,
      { id },
      options,
    );
    const row = header.rows?.[0];
    if (!row) return undefined;
    const metadata = await context.connection.execute<Row>(
      `SELECT TO_CHAR(T.OWNER_SITE_ID) OWNER_SITE_ID,TO_CHAR(T.RIG_ID) RIG_ID,
        TO_CHAR(T.DEPARTMENT_ID) DEPARTMENT_ID,SL.LANGUAGE_CODE SOURCE_LANGUAGE_CODE,
        T.SOURCE_CONTENT_HASH,T.TRANSLATED_CONTENT_HASH
       FROM JSA_TRANSLATION T
       JOIN SYS_LANGUAGE SL ON SL.LANGUAGE_ID=T.SOURCE_LANGUAGE_ID
       WHERE T.TRANSLATION_ID=:id`,
      { id },
      options,
    );
    const meta = metadata.rows?.[0];
    if (!meta) return undefined;
    const segments = await context.connection.execute<Row>(
      `SELECT TO_CHAR(TRANSLATION_SEGMENT_ID) ID,ENTITY_TYPE,
        TO_CHAR(SOURCE_ENTITY_ID) SOURCE_ENTITY_ID,SOURCE_LOGICAL_KEY,FIELD_CODE,
        SECTION_CODE,DISPLAY_ORDER,REQUIRED_FLAG,SOURCE_TEXT,SOURCE_TEXT_HASH,
        TRANSLATED_TEXT,TO_CHAR(ROW_VERSION) ROW_VERSION
       FROM JSA_TRANSLATION_SEGMENT WHERE TRANSLATION_ID=:id
       ORDER BY SECTION_CODE,DISPLAY_ORDER,TRANSLATION_SEGMENT_ID`,
      { id },
      {
        ...options,
        fetchInfo: {
          SOURCE_TEXT: { type: oracledb.STRING },
          TRANSLATED_TEXT: { type: oracledb.STRING },
        },
      },
    );
    return {
      ...this.listItem(row),
      ownerSiteId: meta.OWNER_SITE_ID,
      rigId: meta.RIG_ID,
      departmentId: meta.DEPARTMENT_ID,
      sourceLanguageCode: meta.SOURCE_LANGUAGE_CODE,
      sourceContentHash: meta.SOURCE_CONTENT_HASH,
      ...(meta.TRANSLATED_CONTENT_HASH
        ? { translatedContentHash: meta.TRANSLATED_CONTENT_HASH }
        : {}),
      editable: false,
      reviewable: false,
      printable: row.TRANSLATION_STATUS === 'PUBLISHED',
      segments: (segments.rows ?? []).map((segment) => ({
        id: segment.ID,
        entityType: segment.ENTITY_TYPE,
        sourceEntityId: segment.SOURCE_ENTITY_ID,
        sourceLogicalKey: segment.SOURCE_LOGICAL_KEY,
        fieldCode: segment.FIELD_CODE,
        sectionCode: segment.SECTION_CODE,
        displayOrder: segment.DISPLAY_ORDER,
        required: segment.REQUIRED_FLAG === 'Y',
        sourceText: segment.SOURCE_TEXT,
        sourceTextHash: segment.SOURCE_TEXT_HASH,
        ...(segment.TRANSLATED_TEXT ? { translatedText: segment.TRANSLATED_TEXT } : {}),
        rowVersion: segment.ROW_VERSION,
      })),
      actions: await this.actions(context, id),
    } satisfies TranslationDetail;
  }

  async save(
    context: OracleTransactionContext,
    record: TranslationRecord,
    segments: Array<{ id: string; text: string; rowVersion: string }>,
    actor: TranslationActor,
    correlationId: string,
  ) {
    for (const segment of segments) {
      assertOracleId(segment.id, 'segmentId');
      const updated = await context.connection.execute(
        `UPDATE JSA_TRANSLATION_SEGMENT SET TRANSLATED_TEXT=:text,
          UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
         WHERE TRANSLATION_SEGMENT_ID=:id AND TRANSLATION_ID=:translationId
          AND ROW_VERSION=:rowVersion`,
        {
          text: segment.text,
          actor: actor.username,
          id: segment.id,
          translationId: record.translationId,
          rowVersion: segment.rowVersion,
        },
      );
      if (updated.rowsAffected !== 1) throw new OptimisticLockError();
    }
    await context.connection.execute(
      `UPDATE JSA_TRANSLATION SET TRANSLATION_STATUS='IN_TRANSLATION',
        TRANSLATED_CONTENT_HASH=NULL,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,
        ROW_VERSION=ROW_VERSION+1 WHERE TRANSLATION_ID=:id`,
      { actor: actor.username, id: record.translationId },
    );
    await this.action(
      context,
      record.translationId,
      'SAVE',
      actor,
      record.status,
      'IN_TRANSLATION',
      record.cycleNumber,
      undefined,
      correlationId,
    );
  }

  async submit(
    context: OracleTransactionContext,
    record: TranslationRecord,
    reviewer: TranslationCandidate,
    actor: TranslationActor,
    correlationId: string,
  ) {
    const missing = await context.connection.execute<Row>(
      `SELECT COUNT(*) ITEM_COUNT FROM JSA_TRANSLATION_SEGMENT
       WHERE TRANSLATION_ID=:id AND REQUIRED_FLAG='Y'
        AND SECTION_CODE<>'MATRIX' AND FIELD_CODE<>'CODE'
        AND ENTITY_TYPE NOT IN ('PROMPT','PERFORMER','SUPERVISOR','TOOL')
        AND (TRANSLATED_TEXT IS NULL OR LENGTH(TRIM(TRANSLATED_TEXT))=0)`,
      { id: record.translationId },
      options,
    );
    if ((missing.rows?.[0]?.ITEM_COUNT ?? 0) > 0)
      throw new StateConflictError('Every required Translation segment must be completed');
    if (record.stcReviewerUserId && record.stcReviewerUserId !== reviewer.userId)
      throw new StateConflictError('Resubmission must retain the original STC reviewer');
    const cycle = record.status === 'RETURNED' ? record.cycleNumber + 1 : record.cycleNumber;
    await context.connection.execute(
      `UPDATE JSA_TRANSLATION SET TRANSLATION_STATUS='STC_REVIEW',
        TRANSLATION_CYCLE=:cycle,STC_REVIEWER_USER_ID=:reviewerId,
        STC_REVIEWER_USERNAME=:reviewerUsername,STC_REVIEWER_DISPLAY_NAME=:reviewerName,
        CURRENT_ASSIGNEE_USER_ID=:reviewerId,SUBMITTED_AT=SYSTIMESTAMP,
        UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
       WHERE TRANSLATION_ID=:id`,
      {
        cycle,
        reviewerId: reviewer.userId,
        reviewerUsername: reviewer.username,
        reviewerName: reviewer.displayName,
        actor: actor.username,
        id: record.translationId,
      },
    );
    await this.action(
      context,
      record.translationId,
      record.status === 'RETURNED' ? 'RESUBMIT' : 'SUBMIT',
      actor,
      record.status,
      'STC_REVIEW',
      cycle,
      undefined,
      correlationId,
    );
    await this.notify(
      context,
      reviewer.userId,
      'TRANSLATION_REVIEW_REQUIRED',
      'Translation review required',
      'A translated JSA is ready for STC review.',
      record.translationId,
      actor.username,
    );
  }

  async review(
    context: OracleTransactionContext,
    record: TranslationRecord,
    actionCode: 'RETURN' | 'COMMENT' | 'PUBLISH',
    comment: string | undefined,
    actor: TranslationActor,
    correlationId: string,
  ) {
    if (actionCode === 'COMMENT') {
      await this.action(
        context,
        record.translationId,
        'COMMENT',
        actor,
        record.status,
        record.status,
        record.cycleNumber,
        comment,
        correlationId,
      );
      return;
    }
    const next: TranslationStatus = actionCode === 'RETURN' ? 'RETURNED' : 'PUBLISHED';
    let translatedHash: string | null = null;
    if (actionCode === 'PUBLISH') {
      const texts = await context.connection.execute<Row>(
        `SELECT TRANSLATED_TEXT FROM JSA_TRANSLATION_SEGMENT
         WHERE TRANSLATION_ID=:id
           AND SECTION_CODE<>'MATRIX'
           AND FIELD_CODE<>'CODE'
           AND ENTITY_TYPE NOT IN ('PROMPT','PERFORMER','SUPERVISOR','TOOL')
         ORDER BY SECTION_CODE,DISPLAY_ORDER,TRANSLATION_SEGMENT_ID`,
        { id: record.translationId },
        { ...options, fetchInfo: { TRANSLATED_TEXT: { type: oracledb.STRING } } },
      );
      translatedHash = this.aggregateHash(
        (texts.rows ?? []).map((row) => this.hash(row.TRANSLATED_TEXT ?? '')),
      );
    }
    await context.connection.execute(
      `UPDATE JSA_TRANSLATION SET TRANSLATION_STATUS=:next,
        CURRENT_ASSIGNEE_USER_ID=:assignee,TRANSLATED_CONTENT_HASH=:translatedHash,
        PUBLISHED_AT=CASE WHEN :next='PUBLISHED' THEN SYSTIMESTAMP ELSE PUBLISHED_AT END,
        PUBLISHED_BY_USER_ID=CASE WHEN :next='PUBLISHED'
          THEN TO_NUMBER(:actorId) ELSE PUBLISHED_BY_USER_ID END,
        PUBLISHED_BY_USERNAME=CASE WHEN :next='PUBLISHED' THEN :actor ELSE PUBLISHED_BY_USERNAME END,
        UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
       WHERE TRANSLATION_ID=:id`,
      {
        next,
        assignee: next === 'RETURNED' ? record.translatorUserId : null,
        translatedHash,
        actorId: actor.userId,
        actor: actor.username,
        id: record.translationId,
      },
    );
    await this.action(
      context,
      record.translationId,
      actionCode,
      actor,
      record.status,
      next,
      record.cycleNumber,
      comment,
      correlationId,
    );
    await this.notify(
      context,
      record.translatorUserId,
      next === 'RETURNED' ? 'TRANSLATION_RETURNED' : 'TRANSLATION_PUBLISHED',
      next === 'RETURNED' ? 'Translation returned' : 'Translation published',
      comment ??
        (next === 'RETURNED' ? 'STC returned the Translation.' : 'STC approved the Translation.'),
      record.translationId,
      actor.username,
    );
    if (actionCode === 'PUBLISH' && record.assignedByUserId !== record.translatorUserId)
      await this.notify(
        context,
        record.assignedByUserId,
        'TRANSLATION_PUBLISHED',
        'Translation published',
        'STC approved a Translation assigned by you.',
        record.translationId,
        actor.username,
      );
  }

  async refreshEvidence(
    context: OracleTransactionContext,
    oldRecord: TranslationRecord,
    newTranslationId: string,
    actor: TranslationActor,
    correlationId: string,
  ) {
    await this.action(
      context,
      oldRecord.translationId,
      'REFRESH',
      actor,
      'OUTDATED',
      'OUTDATED',
      oldRecord.cycleNumber,
      `Refreshed as Translation ${newTranslationId}`,
      correlationId,
    );
    const recipients = new Set(
      [oldRecord.translatorUserId, oldRecord.assignedByUserId, oldRecord.stcReviewerUserId].filter(
        Boolean,
      ) as string[],
    );
    for (const recipient of recipients)
      await this.notify(
        context,
        recipient,
        'TRANSLATION_REFRESHED',
        'Outdated Translation refreshed',
        `A new empty Translation ${newTranslationId} was created from the Current Published source.`,
        oldRecord.translationId,
        actor.username,
      );
  }

  async actions(context: OracleTransactionContext, id: string) {
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(TRANSLATION_ACTION_ID) ID,ACTION_CODE,
        TO_CHAR(ACTOR_USER_ID) ACTOR_USER_ID,ACTOR_USERNAME,ACTOR_DISPLAY_NAME,
        FROM_STATUS,TO_STATUS,COMMENT_TEXT,CYCLE_NUMBER,ACTION_AT
       FROM JSA_TRANSLATION_ACTION WHERE TRANSLATION_ID=:id
       ORDER BY ACTION_AT,TRANSLATION_ACTION_ID`,
      { id },
      options,
    );
    return (result.rows ?? []).map((row) => ({
      id: row.ID,
      action: row.ACTION_CODE,
      actorUserId: row.ACTOR_USER_ID,
      actorUsername: row.ACTOR_USERNAME,
      actorDisplayName: row.ACTOR_DISPLAY_NAME,
      ...(row.FROM_STATUS ? { fromStatus: row.FROM_STATUS } : {}),
      ...(row.TO_STATUS ? { toStatus: row.TO_STATUS } : {}),
      ...(row.COMMENT_TEXT ? { comment: row.COMMENT_TEXT } : {}),
      cycleNumber: row.CYCLE_NUMBER,
      actionAt: this.iso(row.ACTION_AT),
    })) as TranslationAction[];
  }

  async counts(context: OracleTransactionContext, userId: string) {
    const result = await context.connection.execute<Row>(
      `SELECT
        SUM(CASE WHEN CURRENT_ASSIGNEE_USER_ID=:userId
          AND TRANSLATION_STATUS IN ('ASSIGNED','IN_TRANSLATION','RETURNED') THEN 1 ELSE 0 END) TASKS,
        SUM(CASE WHEN CURRENT_ASSIGNEE_USER_ID=:userId
          AND TRANSLATION_STATUS='STC_REVIEW' THEN 1 ELSE 0 END) REVIEWS
       FROM JSA_TRANSLATION`,
      { userId },
      options,
    );
    return {
      translationTasks: result.rows?.[0]?.TASKS ?? 0,
      translationReviews: result.rows?.[0]?.REVIEWS ?? 0,
    } satisfies TranslationNavigationCounts;
  }

  private listSelect() {
    return `SELECT TO_CHAR(T.TRANSLATION_ID) TRANSLATION_ID,TO_CHAR(T.JSA_ID) JSA_ID,
      TO_CHAR(T.SOURCE_JSA_VERSION_ID) SOURCE_VERSION_ID,M.JSA_NUMBER,V.JOB_TITLE,
      TO_CHAR(T.TARGET_LANGUAGE_ID) TARGET_LANGUAGE_ID,L.LANGUAGE_CODE TARGET_LANGUAGE_CODE,
      L.LANGUAGE_NAME TARGET_LANGUAGE_NAME,T.TRANSLATION_STATUS,T.TRANSLATION_CYCLE,
      TO_CHAR(T.TRANSLATOR_USER_ID) TRANSLATOR_USER_ID,T.TRANSLATOR_DISPLAY_NAME,
      TO_CHAR(T.STC_REVIEWER_USER_ID) STC_REVIEWER_USER_ID,
      T.STC_REVIEWER_DISPLAY_NAME,V.VERSION_NUMBER,V.VERSION_LABEL,
      TO_CHAR(T.REPLACEMENT_JSA_VERSION_ID) REPLACEMENT_VERSION_ID,
      T.ASSIGNED_AT,T.SUBMITTED_AT,T.PUBLISHED_AT,T.OUTDATED_AT,T.UPDATED_AT,
      TO_CHAR(T.ROW_VERSION) ROW_VERSION ${this.listFrom()}`;
  }

  private listFrom() {
    return `FROM JSA_TRANSLATION T
     JOIN JSA_MASTER M ON M.JSA_ID=T.JSA_ID
     JOIN JSA_VERSION V ON V.JSA_VERSION_ID=T.SOURCE_JSA_VERSION_ID
     JOIN SYS_LANGUAGE L ON L.LANGUAGE_ID=T.TARGET_LANGUAGE_ID`;
  }

  private listItem(row: Row): TranslationListItem {
    return {
      translationId: row.TRANSLATION_ID,
      jsaId: row.JSA_ID,
      sourceVersionId: row.SOURCE_VERSION_ID,
      jsaNumber: row.JSA_NUMBER,
      ...(row.JOB_TITLE ? { jobTitle: row.JOB_TITLE } : {}),
      targetLanguageId: row.TARGET_LANGUAGE_ID,
      targetLanguageCode: row.TARGET_LANGUAGE_CODE,
      targetLanguageName: row.TARGET_LANGUAGE_NAME,
      status: row.TRANSLATION_STATUS,
      cycleNumber: row.TRANSLATION_CYCLE,
      translatorUserId: row.TRANSLATOR_USER_ID,
      translatorDisplayName: row.TRANSLATOR_DISPLAY_NAME,
      ...(row.STC_REVIEWER_USER_ID ? { stcReviewerUserId: row.STC_REVIEWER_USER_ID } : {}),
      ...(row.STC_REVIEWER_DISPLAY_NAME
        ? { stcReviewerDisplayName: row.STC_REVIEWER_DISPLAY_NAME }
        : {}),
      sourceVersionNumber: row.VERSION_NUMBER,
      ...(row.VERSION_LABEL ? { sourceVersionLabel: row.VERSION_LABEL } : {}),
      ...(row.REPLACEMENT_VERSION_ID ? { replacementVersionId: row.REPLACEMENT_VERSION_ID } : {}),
      assignedAt: this.iso(row.ASSIGNED_AT),
      ...(row.SUBMITTED_AT ? { submittedAt: this.iso(row.SUBMITTED_AT) } : {}),
      ...(row.PUBLISHED_AT ? { publishedAt: this.iso(row.PUBLISHED_AT) } : {}),
      ...(row.OUTDATED_AT ? { outdatedAt: this.iso(row.OUTDATED_AT) } : {}),
      updatedAt: this.iso(row.UPDATED_AT),
      rowVersion: row.ROW_VERSION,
    };
  }

  private async action(
    context: OracleTransactionContext,
    translationId: string,
    action: string,
    actor: TranslationActor,
    from: string | undefined,
    to: string | undefined,
    cycle: number,
    comment: string | undefined,
    correlationId: string,
  ) {
    const id = await this.next(context, 'SEQ_JSA_TRANSL_ACTION');
    await context.connection.execute(
      `INSERT INTO JSA_TRANSLATION_ACTION(
        TRANSLATION_ACTION_ID,TRANSLATION_ID,ACTION_CODE,ACTOR_USER_ID,ACTOR_USERNAME,
        ACTOR_DISPLAY_NAME,FROM_STATUS,TO_STATUS,COMMENT_TEXT,CYCLE_NUMBER,CORRELATION_ID)
       VALUES(:id,:translationId,:action,:actorId,:username,:displayName,:fromStatus,
        :toStatus,:commentText,:cycle,:correlationId)`,
      {
        id,
        translationId,
        action,
        actorId: actor.userId,
        username: actor.username,
        displayName: actor.displayName,
        fromStatus: from ?? null,
        toStatus: to ?? null,
        commentText: comment ?? null,
        cycle,
        correlationId,
      },
    );
  }

  private async notify(
    context: OracleTransactionContext,
    userId: string,
    type: string,
    subject: string,
    body: string,
    targetId: string,
    actor: string,
  ) {
    const notificationId = await this.sequence(context, 'SEQ_SYS_NOTIFICATION');
    const outboxId = await this.sequence(context, 'SEQ_SYS_NOTIF_OUTBOX');
    await context.connection.execute(
      `INSERT INTO SYS_NOTIFICATION(NOTIFICATION_ID,RECIPIENT_USER_ID,NOTIFICATION_TYPE,
        SUBJECT_TEXT,BODY_TEXT,TARGET_TYPE,TARGET_ID,CREATED_BY)
       VALUES(:id,:userId,:type,:subject,:body,'JSA_TRANSLATION',:targetId,:actor)`,
      { id: notificationId, userId, type, subject, body, targetId, actor },
    );
    await context.connection.execute(
      `INSERT INTO SYS_NOTIFICATION_OUTBOX(OUTBOX_ID,NOTIFICATION_ID,CREATED_BY)
       VALUES(:id,:notificationId,:actor)`,
      { id: outboxId, notificationId, actor },
    );
  }

  private hash(value: string) {
    return createHash('sha256').update(value, 'utf8').digest('hex').toUpperCase();
  }

  private aggregateHash(hashes: string[]) {
    return this.hash(hashes.join('\n'));
  }

  private iso(value: Date | string) {
    return value instanceof Date ? value.toISOString() : value;
  }

  private next(context: OracleTransactionContext, sequence: string) {
    return this.sequence(context, sequence);
  }

  private async sequence(context: OracleTransactionContext, sequence: string) {
    const allowed = new Set([
      'SEQ_JSA_TRANSLATION',
      'SEQ_JSA_TRANSL_SEGMENT',
      'SEQ_JSA_TRANSL_ACTION',
      'SEQ_SYS_NOTIFICATION',
      'SEQ_SYS_NOTIF_OUTBOX',
    ]);
    if (!allowed.has(sequence)) throw new Error('Unsupported Translation sequence');
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(${sequence}.NEXTVAL) ID FROM DUAL`,
      {},
      options,
    );
    const id = result.rows?.[0]?.ID;
    if (!id) throw new StateConflictError('Oracle identifier allocation failed');
    return id as string;
  }
}
