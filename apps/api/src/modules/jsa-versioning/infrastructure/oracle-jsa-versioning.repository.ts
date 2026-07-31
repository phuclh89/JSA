import { Injectable } from '@nestjs/common';
import oracledb from 'oracledb';
import type { JsaVersionHistoryItem } from '@jsams/shared-types';
import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import { StateConflictError } from '../../../common/errors/application-errors';
import { assertOracleId } from '../../../common/oracle/oracle-id';
import type {
  CheckoutResult,
  JsaVersioningRepository,
} from '../domain/jsa-versioning.repository';
import type { RevisionMaster, SnapshotEntity } from '../domain/jsa-versioning.types';

const options = { outFormat: oracledb.OUT_FORMAT_OBJECT };
type Row = Record<string, any>;

@Injectable()
export class OracleJsaVersioningRepository implements JsaVersioningRepository {
  async master(
    context: OracleTransactionContext,
    jsaId: string,
    lock = false,
  ): Promise<RevisionMaster | undefined> {
    assertOracleId(jsaId, 'jsaId');
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(M.JSA_ID) JSA_ID,M.JSA_NUMBER,
       TO_CHAR(M.OWNER_SITE_ID) SITE_ID,TO_CHAR(M.RIG_ID) RIG_ID,
       TO_CHAR(M.DEPARTMENT_ID) DEPARTMENT_ID,
       TO_CHAR(M.CURRENT_VERSION_ID) CURRENT_VERSION_ID,
       TO_CHAR(M.WORKING_VERSION_ID) WORKING_VERSION_ID,
       TO_CHAR(M.CHECKED_OUT_BY_USER_ID) CHECKED_OUT_BY_USER_ID,
       (SELECT VERSION_STATUS FROM JSA_VERSION WHERE JSA_VERSION_ID=M.CURRENT_VERSION_ID) CURRENT_STATUS,
       (SELECT VERSION_STATUS FROM JSA_VERSION WHERE JSA_VERSION_ID=M.WORKING_VERSION_ID) WORKING_STATUS,
       (SELECT TO_CHAR(BASE_VERSION_ID) FROM JSA_VERSION WHERE JSA_VERSION_ID=M.WORKING_VERSION_ID) BASE_VERSION_ID,
       (SELECT TO_CHAR(MATRIX_VERSION_ID) FROM JSA_VERSION WHERE JSA_VERSION_ID=M.CURRENT_VERSION_ID) MATRIX_VERSION_ID
       FROM JSA_MASTER M WHERE M.JSA_ID=:jsaId${lock ? ' FOR UPDATE' : ''}`,
      { jsaId },
      options,
    );
    const row = result.rows?.[0];
    if (!row) return undefined;
    return {
      jsaId: row.JSA_ID,
      jsaNumber: row.JSA_NUMBER,
      siteId: row.SITE_ID,
      rigId: row.RIG_ID,
      departmentId: row.DEPARTMENT_ID,
      ...(row.CURRENT_VERSION_ID ? { currentVersionId: row.CURRENT_VERSION_ID } : {}),
      ...(row.WORKING_VERSION_ID ? { workingVersionId: row.WORKING_VERSION_ID } : {}),
      ...(row.CURRENT_STATUS ? { currentStatus: row.CURRENT_STATUS } : {}),
      ...(row.WORKING_STATUS ? { workingStatus: row.WORKING_STATUS } : {}),
      ...(row.BASE_VERSION_ID ? { baseVersionId: row.BASE_VERSION_ID } : {}),
      ...(row.CHECKED_OUT_BY_USER_ID
        ? { checkedOutByUserId: row.CHECKED_OUT_BY_USER_ID }
        : {}),
      ...(row.MATRIX_VERSION_ID ? { matrixVersionId: row.MATRIX_VERSION_ID } : {}),
    };
  }

  async checkout(
    context: OracleTransactionContext,
    master: RevisionMaster,
    user: { userId: string; username: string; displayName: string },
  ): Promise<CheckoutResult> {
    const baseVersionId = master.currentVersionId!;
    const matrix = await context.connection.execute<Row>(
      `SELECT MIN(TO_CHAR(A.MATRIX_VERSION_ID)) MATRIX_VERSION_ID,COUNT(*) MATRIX_COUNT
       FROM JSA_RIG_MATRIX_ASSIGNMENT A
       JOIN JSA_RISK_MATRIX_VERSION V ON V.MATRIX_VERSION_ID=A.MATRIX_VERSION_ID
       JOIN JSA_RISK_MATRIX M ON M.MATRIX_ID=V.MATRIX_ID
       WHERE A.RIG_ID=:rigId AND A.IS_ACTIVE='Y'
         AND A.EFFECTIVE_FROM<=SYSTIMESTAMP
         AND (A.EFFECTIVE_TO IS NULL OR A.EFFECTIVE_TO>SYSTIMESTAMP)
         AND V.IS_ACTIVE='Y' AND M.IS_ACTIVE='Y'`,
      { rigId: master.rigId },
      options,
    );
    const matrixRow = matrix.rows?.[0];
    if (!matrixRow?.MATRIX_VERSION_ID || matrixRow.MATRIX_COUNT !== 1)
      throw new StateConflictError('The Rig must have exactly one effective Matrix Version');
    const matrixVersionId = matrixRow.MATRIX_VERSION_ID as string;
    const matrixChanged = matrixVersionId !== master.matrixVersionId;
    const workingVersionId = await this.next(context, 'SEQ_JSA_VERSION');
    const versionNumberResult = await context.connection.execute<Row>(
      `SELECT NVL(MAX(VERSION_NUMBER),0)+1 VERSION_NUMBER
       FROM JSA_VERSION WHERE JSA_ID=:jsaId`,
      { jsaId: master.jsaId },
      options,
    );
    const versionNumber = versionNumberResult.rows?.[0]?.VERSION_NUMBER;

    await context.connection.execute(
      `INSERT INTO JSA_VERSION(
         JSA_VERSION_ID,JSA_ID,VERSION_NUMBER,VERSION_LABEL,BASE_VERSION_ID,VERSION_STATUS,
         OWNER_SITE_ID,RIG_ID,DEPARTMENT_ID,JOB_TYPE_ID,MATRIX_VERSION_ID,LANGUAGE_ID,
         JOB_TITLE,JOB_DESCRIPTION,LOCATION_TEXT,PERSONNEL_TEXT,PTW_REQUIRED_FLAG,PTW_REFERENCE,
         CREATED_BY,UPDATED_BY)
       SELECT :workingVersionId,JSA_ID,:versionNumber,VERSION_LABEL,JSA_VERSION_ID,'DRAFT',
              OWNER_SITE_ID,RIG_ID,DEPARTMENT_ID,JOB_TYPE_ID,:matrixVersionId,LANGUAGE_ID,
              JOB_TITLE,JOB_DESCRIPTION,LOCATION_TEXT,PERSONNEL_TEXT,PTW_REQUIRED_FLAG,PTW_REFERENCE,
              :actor,:actor
       FROM JSA_VERSION
       WHERE JSA_VERSION_ID=:baseVersionId AND JSA_ID=:jsaId AND VERSION_STATUS='PUBLISHED'`,
      {
        workingVersionId,
        versionNumber,
        matrixVersionId,
        actor: user.username,
        baseVersionId,
        jsaId: master.jsaId,
      },
    );

    await this.cloneSimple(
      context,
      `INSERT INTO JSA_VERSION_PROMPT(
         VERSION_PROMPT_ID,JSA_VERSION_ID,LOGICAL_KEY,PROMPT_ID,PROMPT_CODE_SNAPSHOT,
         PROMPT_LABEL_SNAPSHOT,SELECTED_FLAG,RESPONSE_NOTE,IS_ACTIVE,CREATED_BY,UPDATED_BY)
       SELECT SEQ_JSA_VER_PROMPT.NEXTVAL,:workingVersionId,LOGICAL_KEY,PROMPT_ID,
              PROMPT_CODE_SNAPSHOT,PROMPT_LABEL_SNAPSHOT,SELECTED_FLAG,RESPONSE_NOTE,'Y',:actor,:actor
       FROM JSA_VERSION_PROMPT WHERE JSA_VERSION_ID=:baseVersionId AND IS_ACTIVE='Y'`,
      workingVersionId,
      baseVersionId,
      user.username,
    );
    await this.cloneSimple(
      context,
      `INSERT INTO JSA_VERSION_TASK(
         VERSION_TASK_ID,JSA_VERSION_ID,LOGICAL_KEY,PARENT_TASK_ID,TASK_NUMBER,TASK_TITLE,
         TASK_DESCRIPTION,DISPLAY_ORDER,IS_ACTIVE,CREATED_BY,UPDATED_BY)
       SELECT SEQ_JSA_VER_TASK.NEXTVAL,:workingVersionId,LOGICAL_KEY,NULL,TASK_NUMBER,TASK_TITLE,
              TASK_DESCRIPTION,DISPLAY_ORDER,'Y',:actor,:actor
       FROM JSA_VERSION_TASK WHERE JSA_VERSION_ID=:baseVersionId AND IS_ACTIVE='Y'`,
      workingVersionId,
      baseVersionId,
      user.username,
    );
    await context.connection.execute(
      `UPDATE JSA_VERSION_TASK W
       SET PARENT_TASK_ID=(
         SELECT WP.VERSION_TASK_ID
         FROM JSA_VERSION_TASK B
         JOIN JSA_VERSION_TASK BP ON BP.VERSION_TASK_ID=B.PARENT_TASK_ID
         JOIN JSA_VERSION_TASK WP ON WP.JSA_VERSION_ID=:workingVersionId
          AND WP.LOGICAL_KEY=BP.LOGICAL_KEY
         WHERE B.JSA_VERSION_ID=:baseVersionId AND B.LOGICAL_KEY=W.LOGICAL_KEY
       )
       WHERE W.JSA_VERSION_ID=:workingVersionId
         AND EXISTS(
           SELECT 1 FROM JSA_VERSION_TASK B
           WHERE B.JSA_VERSION_ID=:baseVersionId AND B.LOGICAL_KEY=W.LOGICAL_KEY
             AND B.PARENT_TASK_ID IS NOT NULL
         )`,
      { workingVersionId, baseVersionId },
    );
    await context.connection.execute(
      `INSERT INTO JSA_VERSION_HAZARD(
         VERSION_HAZARD_ID,JSA_VERSION_ID,LOGICAL_KEY,VERSION_TASK_ID,HAZARD_TEXT,
         INITIAL_LIKELIHOOD_ID,INITIAL_SEVERITY_ID,INITIAL_CELL_ID,INITIAL_RATING_CODE,
         INITIAL_RESULT_CODE,INITIAL_RESULT_NAME,INITIAL_PROHIBITED_FLAG,
         RESIDUAL_LIKELIHOOD_ID,RESIDUAL_SEVERITY_ID,RESIDUAL_CELL_ID,RESIDUAL_RATING_CODE,
         RESIDUAL_RESULT_CODE,RESIDUAL_RESULT_NAME,RESIDUAL_PROHIBITED_FLAG,
         DISPLAY_ORDER,IS_ACTIVE,CREATED_BY,UPDATED_BY)
       SELECT SEQ_JSA_VER_HAZARD.NEXTVAL,:workingVersionId,H.LOGICAL_KEY,WT.VERSION_TASK_ID,
              H.HAZARD_TEXT,
              ${matrixChanged ? 'NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL' : `H.INITIAL_LIKELIHOOD_ID,H.INITIAL_SEVERITY_ID,H.INITIAL_CELL_ID,H.INITIAL_RATING_CODE,
              H.INITIAL_RESULT_CODE,H.INITIAL_RESULT_NAME,H.INITIAL_PROHIBITED_FLAG,
              H.RESIDUAL_LIKELIHOOD_ID,H.RESIDUAL_SEVERITY_ID,H.RESIDUAL_CELL_ID,H.RESIDUAL_RATING_CODE,
              H.RESIDUAL_RESULT_CODE,H.RESIDUAL_RESULT_NAME,H.RESIDUAL_PROHIBITED_FLAG`},
              H.DISPLAY_ORDER,'Y',:actor,:actor
       FROM JSA_VERSION_HAZARD H
       JOIN JSA_VERSION_TASK BT ON BT.VERSION_TASK_ID=H.VERSION_TASK_ID
       JOIN JSA_VERSION_TASK WT ON WT.JSA_VERSION_ID=:workingVersionId
        AND WT.LOGICAL_KEY=BT.LOGICAL_KEY
       WHERE H.JSA_VERSION_ID=:baseVersionId AND H.IS_ACTIVE='Y'`,
      { workingVersionId, baseVersionId, actor: user.username },
    );
    await context.connection.execute(
      `INSERT INTO JSA_VERSION_CONTROL(
         VERSION_CONTROL_ID,JSA_VERSION_ID,VERSION_HAZARD_ID,LOGICAL_KEY,CONTROL_TEXT,
         DISPLAY_ORDER,IS_ACTIVE,CREATED_BY,UPDATED_BY)
       SELECT SEQ_JSA_VER_CONTROL.NEXTVAL,:workingVersionId,WH.VERSION_HAZARD_ID,
              C.LOGICAL_KEY,C.CONTROL_TEXT,C.DISPLAY_ORDER,'Y',:actor,:actor
       FROM JSA_VERSION_CONTROL C
       JOIN JSA_VERSION_HAZARD BH ON BH.VERSION_HAZARD_ID=C.VERSION_HAZARD_ID
       JOIN JSA_VERSION_HAZARD WH ON WH.JSA_VERSION_ID=:workingVersionId
        AND WH.LOGICAL_KEY=BH.LOGICAL_KEY
       WHERE C.JSA_VERSION_ID=:baseVersionId AND C.IS_ACTIVE='Y'`,
      { workingVersionId, baseVersionId, actor: user.username },
    );
    await context.connection.execute(
      `INSERT INTO JSA_VERSION_PROMPT_COVERAGE(
         PROMPT_COVERAGE_ID,JSA_VERSION_ID,LOGICAL_KEY,VERSION_PROMPT_ID,
         VERSION_HAZARD_ID,VERSION_CONTROL_ID,COVERAGE_NOTE,IS_ACTIVE,CREATED_BY,UPDATED_BY)
       SELECT SEQ_JSA_VER_PROMPT_COV.NEXTVAL,:workingVersionId,C.LOGICAL_KEY,
              WP.VERSION_PROMPT_ID,WH.VERSION_HAZARD_ID,WC.VERSION_CONTROL_ID,
              C.COVERAGE_NOTE,'Y',:actor,:actor
       FROM JSA_VERSION_PROMPT_COVERAGE C
       JOIN JSA_VERSION_PROMPT BP ON BP.VERSION_PROMPT_ID=C.VERSION_PROMPT_ID
       JOIN JSA_VERSION_PROMPT WP ON WP.JSA_VERSION_ID=:workingVersionId
        AND WP.LOGICAL_KEY=BP.LOGICAL_KEY
       JOIN JSA_VERSION_HAZARD BH ON BH.VERSION_HAZARD_ID=C.VERSION_HAZARD_ID
       JOIN JSA_VERSION_HAZARD WH ON WH.JSA_VERSION_ID=:workingVersionId
        AND WH.LOGICAL_KEY=BH.LOGICAL_KEY
       LEFT JOIN JSA_VERSION_CONTROL BC ON BC.VERSION_CONTROL_ID=C.VERSION_CONTROL_ID
       LEFT JOIN JSA_VERSION_CONTROL WC ON WC.JSA_VERSION_ID=:workingVersionId
        AND WC.LOGICAL_KEY=BC.LOGICAL_KEY
       WHERE C.JSA_VERSION_ID=:baseVersionId AND C.IS_ACTIVE='Y'`,
      { workingVersionId, baseVersionId, actor: user.username },
    );
    await context.connection.execute(
      `INSERT INTO JSA_VERSION_BASIC_STEP(
         BASIC_STEP_ID,JSA_VERSION_ID,LOGICAL_KEY,VERSION_TASK_ID,STEP_NUMBER,STEP_TEXT,
         DISPLAY_ORDER,NO_TOOL_REQUIRED_FLAG,IS_ACTIVE,CREATED_BY,UPDATED_BY)
       SELECT SEQ_JSA_VER_BASIC_STEP.NEXTVAL,:workingVersionId,S.LOGICAL_KEY,WT.VERSION_TASK_ID,
              S.STEP_NUMBER,S.STEP_TEXT,S.DISPLAY_ORDER,S.NO_TOOL_REQUIRED_FLAG,'Y',:actor,:actor
       FROM JSA_VERSION_BASIC_STEP S
       LEFT JOIN JSA_VERSION_TASK BT ON BT.VERSION_TASK_ID=S.VERSION_TASK_ID
       LEFT JOIN JSA_VERSION_TASK WT ON WT.JSA_VERSION_ID=:workingVersionId
        AND WT.LOGICAL_KEY=BT.LOGICAL_KEY
       WHERE S.JSA_VERSION_ID=:baseVersionId AND S.IS_ACTIVE='Y'`,
      { workingVersionId, baseVersionId, actor: user.username },
    );
    for (const clone of [
      {
        table: 'JSA_VER_BASIC_STEP_PERFORMER',
        sequence: 'SEQ_JSA_VER_STEP_PERF',
        id: 'STEP_PERFORMER_ID',
        fields:
          'POSITION_ID,POSITION_CODE_SNAPSHOT,POSITION_NAME_SNAPSHOT,DISPLAY_ORDER',
      },
      {
        table: 'JSA_VER_BASIC_STEP_SUPERVISOR',
        sequence: 'SEQ_JSA_VER_STEP_SUP',
        id: 'STEP_SUPERVISOR_ID',
        fields:
          'POSITION_ID,POSITION_CODE_SNAPSHOT,POSITION_NAME_SNAPSHOT,DISPLAY_ORDER',
      },
      {
        table: 'JSA_VER_BASIC_STEP_TOOL',
        sequence: 'SEQ_JSA_VER_STEP_TOOL',
        id: 'STEP_TOOL_ID',
        fields: 'TOOL_ID,TOOL_CODE_SNAPSHOT,TOOL_NAME_SNAPSHOT,DISPLAY_ORDER',
      },
    ])
      await context.connection.execute(
        `INSERT INTO ${clone.table}(
           ${clone.id},JSA_VERSION_ID,BASIC_STEP_ID,LOGICAL_KEY,${clone.fields},
           IS_ACTIVE,CREATED_BY,UPDATED_BY)
         SELECT ${clone.sequence}.NEXTVAL,:workingVersionId,WS.BASIC_STEP_ID,A.LOGICAL_KEY,
                ${clone.fields
                  .split(',')
                  .map((field) => `A.${field}`)
                  .join(',')},'Y',:actor,:actor
         FROM ${clone.table} A
         JOIN JSA_VERSION_BASIC_STEP BS ON BS.BASIC_STEP_ID=A.BASIC_STEP_ID
         JOIN JSA_VERSION_BASIC_STEP WS ON WS.JSA_VERSION_ID=:workingVersionId
          AND WS.LOGICAL_KEY=BS.LOGICAL_KEY
         WHERE A.JSA_VERSION_ID=:baseVersionId AND A.IS_ACTIVE='Y'`,
        { workingVersionId, baseVersionId, actor: user.username },
      );
    await this.cloneSimple(
      context,
      `INSERT INTO JSA_VERSION_PROCEDURE_REF(
         VERSION_PROCEDURE_REF_ID,JSA_VERSION_ID,LOGICAL_KEY,PROCEDURE_REFERENCE_ID,
         REFERENCE_CODE_SNAPSHOT,REFERENCE_TITLE_SNAPSHOT,REVISION_SNAPSHOT,URI_SNAPSHOT,
         NOTES_TEXT,DISPLAY_ORDER,IS_ACTIVE,CREATED_BY,UPDATED_BY)
       SELECT SEQ_JSA_VER_PROC_REF.NEXTVAL,:workingVersionId,LOGICAL_KEY,PROCEDURE_REFERENCE_ID,
              REFERENCE_CODE_SNAPSHOT,REFERENCE_TITLE_SNAPSHOT,REVISION_SNAPSHOT,URI_SNAPSHOT,
              NOTES_TEXT,DISPLAY_ORDER,'Y',:actor,:actor
       FROM JSA_VERSION_PROCEDURE_REF WHERE JSA_VERSION_ID=:baseVersionId AND IS_ACTIVE='Y'`,
      workingVersionId,
      baseVersionId,
      user.username,
    );
    await this.cloneSimple(
      context,
      `INSERT INTO JSA_VERSION_ATTACHMENT(
         VERSION_ATTACHMENT_ID,JSA_VERSION_ID,LOGICAL_KEY,LIBRARY_ASSET_VERSION_ID,
         FILE_NAME,CONTENT_TYPE,FILE_SIZE,STORAGE_KEY,CONTENT_SHA256,ATTACHMENT_STATUS,
         DESCRIPTION,IS_ACTIVE,CREATED_BY,UPDATED_BY)
       SELECT SEQ_JSA_VER_ATTACHMENT.NEXTVAL,:workingVersionId,LOGICAL_KEY,
              LIBRARY_ASSET_VERSION_ID,FILE_NAME,CONTENT_TYPE,FILE_SIZE,STORAGE_KEY,
              CONTENT_SHA256,ATTACHMENT_STATUS,DESCRIPTION,'Y',:actor,:actor
       FROM JSA_VERSION_ATTACHMENT WHERE JSA_VERSION_ID=:baseVersionId AND IS_ACTIVE='Y'`,
      workingVersionId,
      baseVersionId,
      user.username,
    );
    const pointer = await context.connection.execute(
      `UPDATE JSA_MASTER SET WORKING_VERSION_ID=:workingVersionId,
         CHECKED_OUT_BY_USER_ID=:userId,CHECKED_OUT_BY_USERNAME=:username,
         CHECKED_OUT_BY_DISPLAY_NAME=:displayName,CHECKED_OUT_AT=SYSTIMESTAMP,
         UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:username,ROW_VERSION=ROW_VERSION+1
       WHERE JSA_ID=:jsaId AND CURRENT_VERSION_ID=:baseVersionId
         AND WORKING_VERSION_ID IS NULL AND LIFECYCLE_STATUS='PUBLISHED'`,
      {
        workingVersionId,
        userId: user.userId,
        username: user.username,
        displayName: user.displayName || null,
        jsaId: master.jsaId,
        baseVersionId,
      },
    );
    if (pointer.rowsAffected !== 1)
      throw new StateConflictError('A concurrent checkout changed this JSA');
    return { jsaId: master.jsaId, baseVersionId, workingVersionId, matrixChanged };
  }

  async undo(
    context: OracleTransactionContext,
    master: RevisionMaster,
    actor: string,
  ): Promise<void> {
    const version = await context.connection.execute(
      `UPDATE JSA_VERSION SET VERSION_STATUS='CANCELLED',UPDATED_AT=SYSTIMESTAMP,
         UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
       WHERE JSA_VERSION_ID=:workingVersionId AND BASE_VERSION_ID=:baseVersionId
         AND VERSION_STATUS='DRAFT'`,
      {
        actor,
        workingVersionId: master.workingVersionId,
        baseVersionId: master.baseVersionId,
      },
    );
    if (version.rowsAffected !== 1)
      throw new StateConflictError('Working Version is not eligible for Undo Checkout');
    const pointer = await context.connection.execute(
      `UPDATE JSA_MASTER SET WORKING_VERSION_ID=NULL,CHECKED_OUT_BY_USER_ID=NULL,
         CHECKED_OUT_BY_USERNAME=NULL,CHECKED_OUT_BY_DISPLAY_NAME=NULL,CHECKED_OUT_AT=NULL,
         UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
       WHERE JSA_ID=:jsaId AND WORKING_VERSION_ID=:workingVersionId
         AND CURRENT_VERSION_ID=:baseVersionId`,
      {
        actor,
        jsaId: master.jsaId,
        workingVersionId: master.workingVersionId,
        baseVersionId: master.baseVersionId,
      },
    );
    if (pointer.rowsAffected !== 1)
      throw new StateConflictError('Working Version pointer changed concurrently');
  }

  async hasPendingTask(
    context: OracleTransactionContext,
    workingVersionId: string,
  ): Promise<boolean> {
    const result = await context.connection.execute<Row>(
      `SELECT COUNT(*) C FROM JSA_WORKFLOW_TASK T
       JOIN JSA_WORKFLOW_INSTANCE I ON I.INSTANCE_ID=T.INSTANCE_ID
       WHERE I.JSA_VERSION_ID=:workingVersionId AND T.TASK_STATUS='PENDING'`,
      { workingVersionId },
      options,
    );
    return Number(result.rows?.[0]?.C ?? 0) > 0;
  }

  async snapshots(
    context: OracleTransactionContext,
    jsaId: string,
    versionId: string,
  ): Promise<SnapshotEntity[]> {
    assertOracleId(jsaId, 'jsaId');
    assertOracleId(versionId, 'versionId');
    const entities: SnapshotEntity[] = [];
    const query = async (
      sql: string,
      binds: oracledb.BindParameters = { versionId },
    ) =>
      (
        await context.connection.execute<Row>(sql, binds, options)
      ).rows ?? [];
    const header = await query(
      `SELECT TO_CHAR(V.JSA_VERSION_ID) ID,V.VERSION_LABEL,
       TO_CHAR(V.OWNER_SITE_ID) OWNER_SITE_ID,TO_CHAR(V.RIG_ID) RIG_ID,
       TO_CHAR(V.DEPARTMENT_ID) DEPARTMENT_ID,TO_CHAR(V.JOB_TYPE_ID) JOB_TYPE_ID,
       TO_CHAR(V.MATRIX_VERSION_ID) MATRIX_VERSION_ID,TO_CHAR(V.LANGUAGE_ID) LANGUAGE_ID,
       V.JOB_TITLE,V.JOB_DESCRIPTION,V.LOCATION_TEXT,V.PERSONNEL_TEXT,
       V.PTW_REQUIRED_FLAG,V.PTW_REFERENCE
       FROM JSA_VERSION V WHERE V.JSA_ID=:jsaId AND V.JSA_VERSION_ID=:versionId`,
      { jsaId, versionId },
    );
    if (!header[0]) throw new StateConflictError('Version does not belong to this JSA');
    entities.push({
      entityType: 'HEADER',
      logicalKey: 'HEADER',
      label: 'General Information',
      position: '0',
      values: {
        versionLabel: header[0].VERSION_LABEL ?? null,
        ownerSiteId: header[0].OWNER_SITE_ID,
        rigId: header[0].RIG_ID,
        departmentId: header[0].DEPARTMENT_ID,
        jobTypeId: header[0].JOB_TYPE_ID ?? null,
        languageId: header[0].LANGUAGE_ID,
        jobTitle: header[0].JOB_TITLE ?? null,
        jobDescription: header[0].JOB_DESCRIPTION ?? null,
        location: header[0].LOCATION_TEXT ?? null,
        personnel: header[0].PERSONNEL_TEXT ?? null,
        ptwRequired: header[0].PTW_REQUIRED_FLAG === 'Y',
        ptwReference: header[0].PTW_REFERENCE ?? null,
        matrixVersionId: header[0].MATRIX_VERSION_ID,
      },
    });
    for (const row of await query(
      `SELECT TO_CHAR(LOGICAL_KEY) LOGICAL_KEY,PROMPT_LABEL_SNAPSHOT LABEL,
       SELECTED_FLAG,RESPONSE_NOTE FROM JSA_VERSION_PROMPT
       WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y' ORDER BY LOGICAL_KEY`,
    ))
      entities.push(this.entity('PROMPT', row, row.LABEL, '0', {
        selected: row.SELECTED_FLAG === 'Y',
        responseNote: row.RESPONSE_NOTE ?? null,
      }));
    const tasks = await query(
      `SELECT TO_CHAR(T.LOGICAL_KEY) LOGICAL_KEY,T.TASK_TITLE LABEL,T.TASK_NUMBER,
       T.TASK_DESCRIPTION,T.DISPLAY_ORDER,TO_CHAR(P.LOGICAL_KEY) PARENT_LOGICAL_KEY
       FROM JSA_VERSION_TASK T LEFT JOIN JSA_VERSION_TASK P ON P.VERSION_TASK_ID=T.PARENT_TASK_ID
       WHERE T.JSA_VERSION_ID=:versionId AND T.IS_ACTIVE='Y' ORDER BY T.LOGICAL_KEY`,
    );
    for (const row of tasks)
      entities.push(
        this.entity(
          'TASK',
          row,
          row.LABEL,
          `${row.PARENT_LOGICAL_KEY ?? 'ROOT'}:${row.DISPLAY_ORDER}`,
          {
            number: row.TASK_NUMBER ?? null,
            title: row.LABEL,
            description: row.TASK_DESCRIPTION ?? null,
          },
        ),
      );
    for (const row of await query(
      `SELECT TO_CHAR(H.LOGICAL_KEY) LOGICAL_KEY,H.HAZARD_TEXT LABEL,H.DISPLAY_ORDER,
       TO_CHAR(T.LOGICAL_KEY) TASK_LOGICAL_KEY,
       TO_CHAR(H.INITIAL_LIKELIHOOD_ID) INITIAL_LIKELIHOOD_ID,
       TO_CHAR(H.INITIAL_SEVERITY_ID) INITIAL_SEVERITY_ID,H.INITIAL_RATING_CODE,
       H.INITIAL_RESULT_CODE,TO_CHAR(H.RESIDUAL_LIKELIHOOD_ID) RESIDUAL_LIKELIHOOD_ID,
       TO_CHAR(H.RESIDUAL_SEVERITY_ID) RESIDUAL_SEVERITY_ID,H.RESIDUAL_RATING_CODE,
       H.RESIDUAL_RESULT_CODE
       FROM JSA_VERSION_HAZARD H JOIN JSA_VERSION_TASK T
        ON T.VERSION_TASK_ID=H.VERSION_TASK_ID
       WHERE H.JSA_VERSION_ID=:versionId AND H.IS_ACTIVE='Y' ORDER BY H.LOGICAL_KEY`,
    ))
      entities.push(
        this.entity(
          'HAZARD',
          row,
          row.LABEL,
          `${row.TASK_LOGICAL_KEY}:${row.DISPLAY_ORDER}`,
          {
            text: row.LABEL,
            initialLikelihoodId: row.INITIAL_LIKELIHOOD_ID ?? null,
            initialSeverityId: row.INITIAL_SEVERITY_ID ?? null,
            initialRatingCode: row.INITIAL_RATING_CODE ?? null,
            initialResultCode: row.INITIAL_RESULT_CODE ?? null,
            residualLikelihoodId: row.RESIDUAL_LIKELIHOOD_ID ?? null,
            residualSeverityId: row.RESIDUAL_SEVERITY_ID ?? null,
            residualRatingCode: row.RESIDUAL_RATING_CODE ?? null,
            residualResultCode: row.RESIDUAL_RESULT_CODE ?? null,
          },
        ),
      );
    for (const row of await query(
      `SELECT TO_CHAR(C.LOGICAL_KEY) LOGICAL_KEY,C.CONTROL_TEXT LABEL,C.DISPLAY_ORDER,
       TO_CHAR(H.LOGICAL_KEY) HAZARD_LOGICAL_KEY
       FROM JSA_VERSION_CONTROL C JOIN JSA_VERSION_HAZARD H
        ON H.VERSION_HAZARD_ID=C.VERSION_HAZARD_ID
       WHERE C.JSA_VERSION_ID=:versionId AND C.IS_ACTIVE='Y' ORDER BY C.LOGICAL_KEY`,
    ))
      entities.push(
        this.entity(
          'CONTROL',
          row,
          row.LABEL,
          `${row.HAZARD_LOGICAL_KEY}:${row.DISPLAY_ORDER}`,
          { text: row.LABEL },
        ),
      );
    for (const row of await query(
      `SELECT TO_CHAR(S.LOGICAL_KEY) LOGICAL_KEY,S.STEP_TEXT LABEL,S.STEP_NUMBER,
       S.DISPLAY_ORDER,S.NO_TOOL_REQUIRED_FLAG,TO_CHAR(T.LOGICAL_KEY) TASK_LOGICAL_KEY
       FROM JSA_VERSION_BASIC_STEP S LEFT JOIN JSA_VERSION_TASK T
        ON T.VERSION_TASK_ID=S.VERSION_TASK_ID
       WHERE S.JSA_VERSION_ID=:versionId AND S.IS_ACTIVE='Y' ORDER BY S.LOGICAL_KEY`,
    ))
      entities.push(
        this.entity(
          'BASIC_STEP',
          row,
          row.LABEL,
          `${row.TASK_LOGICAL_KEY ?? 'NONE'}:${row.DISPLAY_ORDER}`,
          {
            number: row.STEP_NUMBER ?? null,
            text: row.LABEL,
            noToolRequired: row.NO_TOOL_REQUIRED_FLAG === 'Y',
          },
        ),
      );
    for (const assignment of [
      {
        type: 'PERFORMER',
        table: 'JSA_VER_BASIC_STEP_PERFORMER',
        source: 'POSITION',
      },
      {
        type: 'SUPERVISOR',
        table: 'JSA_VER_BASIC_STEP_SUPERVISOR',
        source: 'POSITION',
      },
      { type: 'TOOL', table: 'JSA_VER_BASIC_STEP_TOOL', source: 'TOOL' },
    ])
      for (const row of await query(
        `SELECT TO_CHAR(A.LOGICAL_KEY) LOGICAL_KEY,A.${assignment.source}_NAME_SNAPSHOT LABEL,
         A.${assignment.source}_CODE_SNAPSHOT CODE,A.DISPLAY_ORDER,
         TO_CHAR(S.LOGICAL_KEY) STEP_LOGICAL_KEY
         FROM ${assignment.table} A JOIN JSA_VERSION_BASIC_STEP S
          ON S.BASIC_STEP_ID=A.BASIC_STEP_ID
         WHERE A.JSA_VERSION_ID=:versionId AND A.IS_ACTIVE='Y' ORDER BY A.LOGICAL_KEY`,
      ))
        entities.push(
          this.entity(
            assignment.type,
            row,
            row.LABEL,
            `${row.STEP_LOGICAL_KEY}:${row.DISPLAY_ORDER}`,
            { code: row.CODE, name: row.LABEL },
          ),
        );
    for (const row of await query(
      `SELECT TO_CHAR(C.LOGICAL_KEY) LOGICAL_KEY,
       P.PROMPT_LABEL_SNAPSHOT || ' / ' || H.HAZARD_TEXT LABEL,
       TO_CHAR(P.LOGICAL_KEY) PROMPT_LOGICAL_KEY,
       TO_CHAR(H.LOGICAL_KEY) HAZARD_LOGICAL_KEY,
       TO_CHAR(CTL.LOGICAL_KEY) CONTROL_LOGICAL_KEY,C.COVERAGE_NOTE
       FROM JSA_VERSION_PROMPT_COVERAGE C
       JOIN JSA_VERSION_PROMPT P ON P.VERSION_PROMPT_ID=C.VERSION_PROMPT_ID
       JOIN JSA_VERSION_HAZARD H ON H.VERSION_HAZARD_ID=C.VERSION_HAZARD_ID
       LEFT JOIN JSA_VERSION_CONTROL CTL ON CTL.VERSION_CONTROL_ID=C.VERSION_CONTROL_ID
       WHERE C.JSA_VERSION_ID=:versionId AND C.IS_ACTIVE='Y' ORDER BY C.LOGICAL_KEY`,
    ))
      entities.push(
        this.entity('PROMPT_COVERAGE', row, row.LABEL, '0', {
          promptLogicalKey: row.PROMPT_LOGICAL_KEY,
          hazardLogicalKey: row.HAZARD_LOGICAL_KEY,
          controlLogicalKey: row.CONTROL_LOGICAL_KEY ?? null,
          note: row.COVERAGE_NOTE ?? null,
        }),
      );
    for (const row of await query(
      `SELECT TO_CHAR(LOGICAL_KEY) LOGICAL_KEY,FILE_NAME LABEL,
       TO_CHAR(LIBRARY_ASSET_VERSION_ID) LIBRARY_ASSET_VERSION_ID,CONTENT_TYPE,
       TO_CHAR(FILE_SIZE) FILE_SIZE,CONTENT_SHA256,DESCRIPTION
       FROM JSA_VERSION_ATTACHMENT
       WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y' ORDER BY LOGICAL_KEY`,
    ))
      entities.push(
        this.entity('ATTACHMENT', row, row.LABEL, '0', {
          libraryAssetVersionId: row.LIBRARY_ASSET_VERSION_ID ?? null,
          fileName: row.LABEL,
          contentType: row.CONTENT_TYPE ?? null,
          fileSize: row.FILE_SIZE ?? null,
          sha256: row.CONTENT_SHA256 ?? null,
          description: row.DESCRIPTION ?? null,
        }),
      );
    for (const row of await query(
      `SELECT TO_CHAR(LOGICAL_KEY) LOGICAL_KEY,REFERENCE_TITLE_SNAPSHOT LABEL,
       TO_CHAR(PROCEDURE_REFERENCE_ID) PROCEDURE_REFERENCE_ID,
       REFERENCE_CODE_SNAPSHOT,REVISION_SNAPSHOT,URI_SNAPSHOT,NOTES_TEXT,DISPLAY_ORDER
       FROM JSA_VERSION_PROCEDURE_REF
       WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y' ORDER BY LOGICAL_KEY`,
    ))
      entities.push(
        this.entity('PROCEDURE', row, row.LABEL, String(row.DISPLAY_ORDER), {
          procedureReferenceId: row.PROCEDURE_REFERENCE_ID ?? null,
          code: row.REFERENCE_CODE_SNAPSHOT ?? null,
          title: row.LABEL,
          revision: row.REVISION_SNAPSHOT ?? null,
          uri: row.URI_SNAPSHOT ?? null,
          notes: row.NOTES_TEXT ?? null,
        }),
      );
    return entities;
  }

  async history(
    context: OracleTransactionContext,
    jsaId: string,
  ): Promise<JsaVersionHistoryItem[]> {
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(JSA_VERSION_ID) VERSION_ID,VERSION_NUMBER,VERSION_LABEL,
       TO_CHAR(BASE_VERSION_ID) BASE_VERSION_ID,VERSION_STATUS,
       TO_CHAR(MATRIX_VERSION_ID) MATRIX_VERSION_ID,CREATED_AT,CREATED_BY,
       PUBLISHED_AT,PUBLISHED_BY_USERNAME
       FROM JSA_VERSION WHERE JSA_ID=:jsaId
       ORDER BY VERSION_NUMBER DESC,JSA_VERSION_ID DESC`,
      { jsaId },
      options,
    );
    return (result.rows ?? []).map((row) => ({
      versionId: row.VERSION_ID,
      versionNumber: row.VERSION_NUMBER,
      ...(row.VERSION_LABEL ? { versionLabel: row.VERSION_LABEL } : {}),
      ...(row.BASE_VERSION_ID ? { baseVersionId: row.BASE_VERSION_ID } : {}),
      status: row.VERSION_STATUS,
      matrixVersionId: row.MATRIX_VERSION_ID,
      createdAt: row.CREATED_AT,
      createdBy: row.CREATED_BY,
      ...(row.PUBLISHED_AT ? { publishedAt: row.PUBLISHED_AT } : {}),
      ...(row.PUBLISHED_BY_USERNAME
        ? { publishedByUsername: row.PUBLISHED_BY_USERNAME }
        : {}),
    }));
  }

  private entity(
    entityType: string,
    row: Row,
    label: string,
    position: string,
    values: SnapshotEntity['values'],
  ): SnapshotEntity {
    return { entityType, logicalKey: row.LOGICAL_KEY, label, position, values };
  }

  private cloneSimple(
    context: OracleTransactionContext,
    sql: string,
    workingVersionId: string,
    baseVersionId: string,
    actor: string,
  ) {
    return context.connection.execute(sql, { workingVersionId, baseVersionId, actor });
  }

  private async next(context: OracleTransactionContext, sequence: string): Promise<string> {
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(${sequence}.NEXTVAL) ID FROM DUAL`,
      {},
      options,
    );
    return result.rows![0]!.ID;
  }
}
