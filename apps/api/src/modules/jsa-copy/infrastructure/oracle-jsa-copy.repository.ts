import { Injectable } from '@nestjs/common';
import type {
  JsaCopyDestinationOptions,
  JsaCopyMatrixSummary,
  JsaCopyProvenance,
  JsaCopyResult,
} from '@jsams/shared-types';
import oracledb from 'oracledb';
import { StateConflictError } from '../../../common/errors/application-errors';
import { assertOracleId } from '../../../common/oracle/oracle-id';
import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import type { JsaCopyRepository } from '../domain/jsa-copy.repository';
import type {
  CopyAggregate,
  CopyDestinationResolution,
  CopyExecutionPlan,
  CopyReferenceCandidate,
  CopyRequestIdentity,
  CopySourceRecord,
  ExistingCopyRequest,
} from '../domain/jsa-copy.types';

const options = { outFormat: oracledb.OUT_FORMAT_OBJECT };
type Row = Record<string, any>;

@Injectable()
export class OracleJsaCopyRepository implements JsaCopyRepository {
  async source(
    context: OracleTransactionContext,
    jsaId: string,
    lock = false,
  ): Promise<CopySourceRecord | undefined> {
    assertOracleId(jsaId, 'jsaId');
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(M.JSA_ID) JSA_ID,M.JSA_NUMBER,M.LIFECYCLE_STATUS,
              TO_CHAR(M.CURRENT_VERSION_ID) CURRENT_VERSION_ID,
              TO_CHAR(V.JSA_VERSION_ID) VERSION_ID,V.VERSION_STATUS,V.VERSION_NUMBER,V.VERSION_LABEL,
              V.JOB_TITLE,TO_CHAR(V.MATRIX_VERSION_ID) MATRIX_VERSION_ID,
              TO_CHAR(M.OWNER_SITE_ID) SITE_ID,S.SITE_CODE,S.SITE_NAME,
              TO_CHAR(M.RIG_ID) RIG_ID,R.RIG_CODE,R.RIG_NAME,
              TO_CHAR(M.DEPARTMENT_ID) DEPARTMENT_ID,D.DEPARTMENT_CODE,D.DEPARTMENT_NAME,
              RM.MATRIX_CODE,RM.MATRIX_NAME,MV.VERSION_CODE,RM.DIMENSION_SIZE
       FROM JSA_MASTER M
       JOIN SYS_SITE S ON S.SITE_ID=M.OWNER_SITE_ID
       JOIN SYS_RIG R ON R.RIG_ID=M.RIG_ID AND R.SITE_ID=M.OWNER_SITE_ID
       JOIN SYS_DEPARTMENT D ON D.DEPARTMENT_ID=M.DEPARTMENT_ID
        AND D.RIG_ID=M.RIG_ID AND D.SITE_ID=M.OWNER_SITE_ID
       LEFT JOIN JSA_VERSION V ON V.JSA_VERSION_ID=M.CURRENT_VERSION_ID AND V.JSA_ID=M.JSA_ID
       LEFT JOIN JSA_RISK_MATRIX_VERSION MV ON MV.MATRIX_VERSION_ID=V.MATRIX_VERSION_ID
       LEFT JOIN JSA_RISK_MATRIX RM ON RM.MATRIX_ID=MV.MATRIX_ID
       WHERE M.JSA_ID=:jsaId${lock ? ' FOR UPDATE OF M.JSA_ID' : ''}`,
      { jsaId },
      options,
    );
    const row = result.rows?.[0];
    if (!row) return undefined;
    const matrix = row.MATRIX_VERSION_ID ? this.matrix(row) : undefined;
    return {
      jsaId: row.JSA_ID,
      versionId: row.VERSION_ID ?? '',
      currentVersionId: row.CURRENT_VERSION_ID,
      currentVersionPointer: row.CURRENT_VERSION_ID,
      jsaNumber: row.JSA_NUMBER,
      ...(row.JOB_TITLE ? { jobTitle: row.JOB_TITLE } : {}),
      versionNumber: row.VERSION_NUMBER ?? 0,
      ...(row.VERSION_LABEL ? { versionLabel: row.VERSION_LABEL } : {}),
      lifecycleStatus: row.LIFECYCLE_STATUS,
      ...(row.VERSION_STATUS ? { versionStatus: row.VERSION_STATUS } : {}),
      siteId: row.SITE_ID,
      siteCode: row.SITE_CODE,
      siteName: row.SITE_NAME,
      rigId: row.RIG_ID,
      rigCode: row.RIG_CODE,
      rigName: row.RIG_NAME,
      departmentId: row.DEPARTMENT_ID,
      departmentCode: row.DEPARTMENT_CODE,
      departmentName: row.DEPARTMENT_NAME,
      ...(matrix ? { matrix } : {}),
    };
  }

  async destinationResolution(
    context: OracleTransactionContext,
    siteId: string,
    rigId: string,
    departmentId: string,
  ): Promise<CopyDestinationResolution> {
    for (const [label, value] of Object.entries({ siteId, rigId, departmentId }))
      assertOracleId(value, label);
    const destination = await context.connection.execute<Row>(
      `SELECT TO_CHAR(S.SITE_ID) SITE_ID,S.SITE_CODE,S.SITE_NAME,
              TO_CHAR(R.RIG_ID) RIG_ID,R.RIG_CODE,R.RIG_NAME,
              TO_CHAR(D.DEPARTMENT_ID) DEPARTMENT_ID,D.DEPARTMENT_CODE,D.DEPARTMENT_NAME
       FROM SYS_SITE S
       JOIN SYS_RIG R ON R.SITE_ID=S.SITE_ID AND R.RIG_ID=:rigId AND R.IS_ACTIVE='Y'
       JOIN SYS_DEPARTMENT D ON D.SITE_ID=S.SITE_ID AND D.RIG_ID=R.RIG_ID
        AND D.DEPARTMENT_ID=:departmentId AND D.IS_ACTIVE='Y'
       WHERE S.SITE_ID=:siteId AND S.IS_ACTIVE='Y'`,
      { siteId, rigId, departmentId },
      options,
    );
    const destinationRow = destination.rows?.[0];
    const language = await context.connection.execute<Row>(
      `SELECT MIN(TO_CHAR(LANGUAGE_ID)) LANGUAGE_ID,COUNT(*) ITEM_COUNT
       FROM SYS_LANGUAGE WHERE UPPER(LANGUAGE_CODE)='EN' AND IS_ACTIVE='Y'`,
      {},
      options,
    );
    const english = language.rows?.[0];
    if (!destinationRow)
      return {
        matrixComplete: false,
        englishCount: english?.ITEM_COUNT ?? 0,
        ...(english?.LANGUAGE_ID ? { languageId: english.LANGUAGE_ID } : {}),
        promptCandidates: [],
        positionCandidates: [],
        toolCandidates: [],
      };

    const matrixResult = await context.connection.execute<Row>(
      `SELECT TO_CHAR(A.MATRIX_VERSION_ID) MATRIX_VERSION_ID,RM.MATRIX_CODE,RM.MATRIX_NAME,
              MV.VERSION_CODE,RM.DIMENSION_SIZE,
              (SELECT COUNT(*) FROM JSA_RISK_LIKELIHOOD L
                WHERE L.MATRIX_VERSION_ID=A.MATRIX_VERSION_ID AND L.IS_ACTIVE='Y') L_COUNT,
              (SELECT COUNT(*) FROM JSA_RISK_SEVERITY S
                WHERE S.MATRIX_VERSION_ID=A.MATRIX_VERSION_ID AND S.IS_ACTIVE='Y') S_COUNT,
              (SELECT COUNT(*) FROM JSA_RISK_MATRIX_CELL C
                WHERE C.MATRIX_VERSION_ID=A.MATRIX_VERSION_ID AND C.IS_ACTIVE='Y') C_COUNT
       FROM JSA_RIG_MATRIX_ASSIGNMENT A
       JOIN JSA_RISK_MATRIX_VERSION MV ON MV.MATRIX_VERSION_ID=A.MATRIX_VERSION_ID
        AND MV.IS_ACTIVE='Y'
       JOIN JSA_RISK_MATRIX RM ON RM.MATRIX_ID=MV.MATRIX_ID AND RM.IS_ACTIVE='Y'
       WHERE A.RIG_ID=:rigId AND A.IS_ACTIVE='Y'
        AND A.EFFECTIVE_FROM<=SYSTIMESTAMP
        AND (A.EFFECTIVE_TO IS NULL OR A.EFFECTIVE_TO>SYSTIMESTAMP)`,
      { rigId },
      options,
    );
    const matrixRows = matrixResult.rows ?? [];
    const matrixRow = matrixRows.length === 1 ? matrixRows[0] : undefined;
    const matrixComplete = Boolean(
      matrixRow &&
      matrixRow.L_COUNT === matrixRow.DIMENSION_SIZE &&
      matrixRow.S_COUNT === matrixRow.DIMENSION_SIZE &&
      matrixRow.C_COUNT === matrixRow.DIMENSION_SIZE * matrixRow.DIMENSION_SIZE,
    );
    const binds = { siteId, rigId, departmentId };
    const [prompts, positions, tools] = await this.referenceCandidates(context, binds);
    return {
      destination: {
        siteId: destinationRow.SITE_ID,
        siteCode: destinationRow.SITE_CODE,
        siteName: destinationRow.SITE_NAME,
        rigId: destinationRow.RIG_ID,
        rigCode: destinationRow.RIG_CODE,
        rigName: destinationRow.RIG_NAME,
        departmentId: destinationRow.DEPARTMENT_ID,
        departmentCode: destinationRow.DEPARTMENT_CODE,
        departmentName: destinationRow.DEPARTMENT_NAME,
      },
      ...(matrixRow ? { matrix: this.matrix(matrixRow) } : {}),
      matrixComplete,
      englishCount: english?.ITEM_COUNT ?? 0,
      ...(english?.LANGUAGE_ID ? { languageId: english.LANGUAGE_ID } : {}),
      promptCandidates: prompts,
      positionCandidates: positions,
      toolCandidates: tools,
    };
  }

  async aggregate(
    context: OracleTransactionContext,
    sourceVersionId: string,
    sourceMatrixId?: string,
  ): Promise<CopyAggregate> {
    assertOracleId(sourceVersionId, 'sourceVersionId');
    if (sourceMatrixId) assertOracleId(sourceMatrixId, 'sourceMatrixId');
    const binds = { versionId: sourceVersionId };
    const promptResult = await context.connection.execute<Row>(
      `SELECT TO_CHAR(VERSION_PROMPT_ID) ID,PROMPT_CODE_SNAPSHOT CODE,
              PROMPT_LABEL_SNAPSHOT NAME,RESPONSE_NOTE
       FROM JSA_VERSION_PROMPT
       WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y' AND SELECTED_FLAG='Y'
       ORDER BY VERSION_PROMPT_ID`,
      binds,
      options,
    );
    const taskResult = await context.connection.execute<Row>(
      `SELECT TO_CHAR(VERSION_TASK_ID) ID,TO_CHAR(PARENT_TASK_ID) PARENT_ID,
              TASK_NUMBER,TASK_TITLE,TASK_DESCRIPTION,DISPLAY_ORDER
       FROM JSA_VERSION_TASK
       WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y'
       ORDER BY DISPLAY_ORDER,VERSION_TASK_ID`,
      binds,
      {
        ...options,
        fetchInfo: { TASK_DESCRIPTION: { type: oracledb.STRING } },
      },
    );
    const hazardResult = await context.connection.execute<Row>(
      `SELECT TO_CHAR(VERSION_HAZARD_ID) ID,TO_CHAR(VERSION_TASK_ID) TASK_ID,
              HAZARD_TEXT,DISPLAY_ORDER,
              TO_CHAR(INITIAL_LIKELIHOOD_ID) INITIAL_LIKELIHOOD_ID,
              TO_CHAR(INITIAL_SEVERITY_ID) INITIAL_SEVERITY_ID,
              TO_CHAR(INITIAL_CELL_ID) INITIAL_CELL_ID,INITIAL_RATING_CODE,
              INITIAL_RESULT_CODE,INITIAL_RESULT_NAME,INITIAL_PROHIBITED_FLAG,
              TO_CHAR(RESIDUAL_LIKELIHOOD_ID) RESIDUAL_LIKELIHOOD_ID,
              TO_CHAR(RESIDUAL_SEVERITY_ID) RESIDUAL_SEVERITY_ID,
              TO_CHAR(RESIDUAL_CELL_ID) RESIDUAL_CELL_ID,RESIDUAL_RATING_CODE,
              RESIDUAL_RESULT_CODE,RESIDUAL_RESULT_NAME,RESIDUAL_PROHIBITED_FLAG
       FROM JSA_VERSION_HAZARD
       WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y'
       ORDER BY DISPLAY_ORDER,VERSION_HAZARD_ID`,
      binds,
      options,
    );
    const controlResult = await context.connection.execute<Row>(
      `SELECT TO_CHAR(VERSION_CONTROL_ID) ID,TO_CHAR(VERSION_HAZARD_ID) HAZARD_ID,
              CONTROL_TEXT,DISPLAY_ORDER
       FROM JSA_VERSION_CONTROL
       WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y'
       ORDER BY DISPLAY_ORDER,VERSION_CONTROL_ID`,
      binds,
      options,
    );
    const stepResult = await context.connection.execute<Row>(
      `SELECT TO_CHAR(BASIC_STEP_ID) ID,TO_CHAR(VERSION_TASK_ID) TASK_ID,
              STEP_NUMBER,STEP_TEXT,DISPLAY_ORDER,NO_TOOL_REQUIRED_FLAG
       FROM JSA_VERSION_BASIC_STEP
       WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y'
       ORDER BY DISPLAY_ORDER,BASIC_STEP_ID`,
      binds,
      options,
    );
    const performerResult = await this.assignments(
      context,
      'JSA_VER_BASIC_STEP_PERFORMER',
      'STEP_PERFORMER_ID',
      'POSITION',
      sourceVersionId,
    );
    const supervisorResult = await this.assignments(
      context,
      'JSA_VER_BASIC_STEP_SUPERVISOR',
      'STEP_SUPERVISOR_ID',
      'POSITION',
      sourceVersionId,
    );
    const toolResult = await context.connection.execute<Row>(
      `SELECT TO_CHAR(A.STEP_TOOL_ID) ID,TO_CHAR(A.BASIC_STEP_ID) STEP_ID,
              A.TOOL_CODE_SNAPSHOT CODE,A.TOOL_NAME_SNAPSHOT NAME,A.DISPLAY_ORDER,
              S.NO_TOOL_REQUIRED_FLAG
       FROM JSA_VER_BASIC_STEP_TOOL A
       JOIN JSA_VERSION_BASIC_STEP S ON S.BASIC_STEP_ID=A.BASIC_STEP_ID
        AND S.JSA_VERSION_ID=A.JSA_VERSION_ID
       WHERE A.JSA_VERSION_ID=:versionId AND A.IS_ACTIVE='Y'
       ORDER BY A.DISPLAY_ORDER,A.STEP_TOOL_ID`,
      binds,
      options,
    );
    const attachmentResult = await context.connection.execute<Row>(
      `SELECT FILE_NAME FROM JSA_VERSION_ATTACHMENT
       WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y'
       ORDER BY VERSION_ATTACHMENT_ID`,
      binds,
      options,
    );
    const legacyResult = await context.connection.execute<Row>(
      `SELECT
        (SELECT COUNT(*) FROM JSA_VERSION_PROMPT_COVERAGE
          WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y') COVERAGE_COUNT,
        (SELECT COUNT(*) FROM JSA_VERSION_PROCEDURE_REF
          WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y') PROCEDURE_COUNT,
        CASE WHEN JOB_TYPE_ID IS NOT NULL OR JOB_DESCRIPTION IS NOT NULL
          OR LOCATION_TEXT IS NOT NULL OR PERSONNEL_TEXT IS NOT NULL
          OR PTW_REQUIRED_FLAG='Y' OR PTW_REFERENCE IS NOT NULL THEN 1 ELSE 0 END LEGACY_HEADER
       FROM JSA_VERSION WHERE JSA_VERSION_ID=:versionId`,
      binds,
      options,
    );
    const invalidRiskReferenceCount = sourceMatrixId
      ? await this.invalidRiskReferences(context, sourceVersionId, sourceMatrixId)
      : 0;
    const legacy = legacyResult.rows?.[0];
    const steps = (stepResult.rows ?? []).map((row) => ({
      id: row.ID,
      ...(row.TASK_ID ? { taskId: row.TASK_ID } : {}),
      ...(row.STEP_NUMBER ? { number: row.STEP_NUMBER } : {}),
      text: row.STEP_TEXT,
      displayOrder: row.DISPLAY_ORDER,
      noToolRequired: row.NO_TOOL_REQUIRED_FLAG === 'Y',
    }));
    return {
      prompts: (promptResult.rows ?? []).map((row) => ({
        id: row.ID,
        code: row.CODE,
        name: row.NAME,
        ...(row.RESPONSE_NOTE ? { responseNote: row.RESPONSE_NOTE } : {}),
      })),
      tasks: (taskResult.rows ?? []).map((row) => ({
        id: row.ID,
        ...(row.PARENT_ID ? { parentId: row.PARENT_ID } : {}),
        ...(row.TASK_NUMBER ? { number: row.TASK_NUMBER } : {}),
        title: row.TASK_TITLE,
        ...(row.TASK_DESCRIPTION ? { description: row.TASK_DESCRIPTION } : {}),
        displayOrder: row.DISPLAY_ORDER,
      })),
      hazards: (hazardResult.rows ?? []).map((row) => this.hazard(row)),
      controls: (controlResult.rows ?? []).map((row) => ({
        id: row.ID,
        hazardId: row.HAZARD_ID,
        text: row.CONTROL_TEXT,
        displayOrder: row.DISPLAY_ORDER,
      })),
      steps,
      performers: performerResult,
      supervisors: supervisorResult,
      tools: (toolResult.rows ?? []).map((row) => ({
        id: row.ID,
        stepId: row.STEP_ID,
        code: row.CODE,
        name: row.NAME,
        displayOrder: row.DISPLAY_ORDER,
        noToolRequired: row.NO_TOOL_REQUIRED_FLAG === 'Y',
      })),
      attachmentNames: (attachmentResult.rows ?? []).map((row) => row.FILE_NAME),
      promptCoverageCount: legacy?.COVERAGE_COUNT ?? 0,
      procedureReferenceCount: legacy?.PROCEDURE_COUNT ?? 0,
      legacyHeaderPresent: legacy?.LEGACY_HEADER === 1,
      invalidRiskReferenceCount,
    };
  }

  async destinationOptions(
    context: OracleTransactionContext,
    localSiteId: string,
  ): Promise<JsaCopyDestinationOptions | undefined> {
    assertOracleId(localSiteId, 'LOCAL_SITE_ID');
    const site = await context.connection.execute<Row>(
      `SELECT TO_CHAR(SITE_ID) ID,SITE_CODE CODE,SITE_NAME NAME
       FROM SYS_SITE WHERE SITE_ID=:siteId AND IS_ACTIVE='Y'`,
      { siteId: localSiteId },
      options,
    );
    if (!site.rows?.[0]) return undefined;
    const rows = await context.connection.execute<Row>(
      `SELECT TO_CHAR(R.RIG_ID) RIG_ID,R.RIG_CODE,R.RIG_NAME,
              TO_CHAR(D.DEPARTMENT_ID) DEPARTMENT_ID,D.DEPARTMENT_CODE,D.DEPARTMENT_NAME
       FROM SYS_RIG R
       JOIN SYS_DEPARTMENT D ON D.SITE_ID=R.SITE_ID AND D.RIG_ID=R.RIG_ID
        AND D.IS_ACTIVE='Y'
       WHERE R.SITE_ID=:siteId AND R.IS_ACTIVE='Y'
       ORDER BY R.RIG_NAME,D.DEPARTMENT_NAME`,
      { siteId: localSiteId },
      options,
    );
    const rigs = new Map<string, { id: string; code: string; name: string; siteId: string }>();
    for (const row of rows.rows ?? [])
      rigs.set(row.RIG_ID, {
        id: row.RIG_ID,
        code: row.RIG_CODE,
        name: row.RIG_NAME,
        siteId: localSiteId,
      });
    return {
      localSite: {
        id: site.rows[0].ID,
        code: site.rows[0].CODE,
        name: site.rows[0].NAME,
      },
      rigs: [...rigs.values()],
      departments: (rows.rows ?? []).map((row) => ({
        id: row.DEPARTMENT_ID,
        code: row.DEPARTMENT_CODE,
        name: row.DEPARTMENT_NAME,
        siteId: localSiteId,
        rigId: row.RIG_ID,
      })),
    };
  }

  async existingRequest(
    context: OracleTransactionContext,
    userId: string,
    requestKey: string,
  ): Promise<ExistingCopyRequest | undefined> {
    assertOracleId(userId, 'userId');
    const result = await context.connection.execute<Row>(
      `SELECT P.REQUEST_HASH,TO_CHAR(P.DESTINATION_JSA_ID) DESTINATION_JSA_ID,
              TO_CHAR(P.DESTINATION_VERSION_ID) DESTINATION_VERSION_ID,D.JSA_NUMBER,
              TO_CHAR(P.SOURCE_JSA_ID) SOURCE_JSA_ID,TO_CHAR(P.SOURCE_VERSION_ID) SOURCE_VERSION_ID,
              S.JSA_NUMBER SOURCE_JSA_NUMBER,
              TO_CHAR(D.ROW_VERSION) MASTER_ROW_VERSION,TO_CHAR(DV.ROW_VERSION) VERSION_ROW_VERSION,
              TO_CHAR(D.OWNER_SITE_ID) SITE_ID,DS.SITE_CODE,DS.SITE_NAME,
              TO_CHAR(D.RIG_ID) RIG_ID,DR.RIG_CODE,DR.RIG_NAME,
              TO_CHAR(D.DEPARTMENT_ID) DEPARTMENT_ID,DD.DEPARTMENT_CODE,DD.DEPARTMENT_NAME,
              TO_CHAR(SV.MATRIX_VERSION_ID) SOURCE_MATRIX_ID,SM.MATRIX_CODE SOURCE_MATRIX_CODE,
              SM.MATRIX_NAME SOURCE_MATRIX_NAME,SMV.VERSION_CODE SOURCE_MATRIX_VERSION,
              SM.DIMENSION_SIZE SOURCE_DIMENSION,
              TO_CHAR(DV.MATRIX_VERSION_ID) DEST_MATRIX_ID,DM.MATRIX_CODE DEST_MATRIX_CODE,
              DM.MATRIX_NAME DEST_MATRIX_NAME,DMV.VERSION_CODE DEST_MATRIX_VERSION,
              DM.DIMENSION_SIZE DEST_DIMENSION,
              (SELECT COUNT(*) FROM JSA_VERSION_ATTACHMENT A
                WHERE A.JSA_VERSION_ID=P.SOURCE_VERSION_ID AND A.IS_ACTIVE='Y') ATTACHMENT_COUNT,
              (SELECT COUNT(*) FROM JSA_VERSION_PROMPT SP
                WHERE SP.JSA_VERSION_ID=P.SOURCE_VERSION_ID AND SP.IS_ACTIVE='Y'
                 AND SP.SELECTED_FLAG='Y' AND NOT EXISTS (
                   SELECT 1 FROM JSA_VERSION_PROMPT DP
                   WHERE DP.JSA_VERSION_ID=DV.JSA_VERSION_ID
                    AND UPPER(DP.PROMPT_CODE_SNAPSHOT)=UPPER(SP.PROMPT_CODE_SNAPSHOT)
                 )) PROMPT_WARNING_COUNT
       FROM JSA_COPY_PROVENANCE P
       JOIN JSA_MASTER D ON D.JSA_ID=P.DESTINATION_JSA_ID
       JOIN JSA_VERSION DV ON DV.JSA_VERSION_ID=P.DESTINATION_VERSION_ID
       JOIN JSA_MASTER S ON S.JSA_ID=P.SOURCE_JSA_ID
       JOIN JSA_VERSION SV ON SV.JSA_VERSION_ID=P.SOURCE_VERSION_ID
       JOIN SYS_SITE DS ON DS.SITE_ID=D.OWNER_SITE_ID
       JOIN SYS_RIG DR ON DR.RIG_ID=D.RIG_ID
       JOIN SYS_DEPARTMENT DD ON DD.DEPARTMENT_ID=D.DEPARTMENT_ID
       JOIN JSA_RISK_MATRIX_VERSION SMV ON SMV.MATRIX_VERSION_ID=SV.MATRIX_VERSION_ID
       JOIN JSA_RISK_MATRIX SM ON SM.MATRIX_ID=SMV.MATRIX_ID
       JOIN JSA_RISK_MATRIX_VERSION DMV ON DMV.MATRIX_VERSION_ID=DV.MATRIX_VERSION_ID
       JOIN JSA_RISK_MATRIX DM ON DM.MATRIX_ID=DMV.MATRIX_ID
       WHERE P.COPIED_BY_USER_ID=:userId AND P.REQUEST_KEY=:requestKey`,
      { userId, requestKey },
      options,
    );
    const row = result.rows?.[0];
    if (!row) return undefined;
    const preserved = row.SOURCE_MATRIX_ID === row.DEST_MATRIX_ID;
    return {
      requestHash: row.REQUEST_HASH,
      result: {
        destinationJsaId: row.DESTINATION_JSA_ID,
        destinationWorkingVersionId: row.DESTINATION_VERSION_ID,
        temporaryJsaNumber: row.JSA_NUMBER,
        destination: {
          siteId: row.SITE_ID,
          siteCode: row.SITE_CODE,
          siteName: row.SITE_NAME,
          rigId: row.RIG_ID,
          rigCode: row.RIG_CODE,
          rigName: row.RIG_NAME,
          departmentId: row.DEPARTMENT_ID,
          departmentCode: row.DEPARTMENT_CODE,
          departmentName: row.DEPARTMENT_NAME,
        },
        sourceJsaId: row.SOURCE_JSA_ID,
        sourceVersionId: row.SOURCE_VERSION_ID,
        sourceJsaNumber: row.SOURCE_JSA_NUMBER,
        sourceMatrix: this.namedMatrix(row, 'SOURCE'),
        destinationMatrix: this.namedMatrix(row, 'DEST'),
        riskCopyMode: preserved ? 'PRESERVED' : 'CLEARED',
        matrixReassessmentRequired: !preserved,
        excludedAttachmentCount: row.ATTACHMENT_COUNT,
        promptWarningCount: row.PROMPT_WARNING_COUNT,
        masterRowVersion: row.MASTER_ROW_VERSION,
        versionRowVersion: row.VERSION_ROW_VERSION,
        route: `/jsa/${row.DESTINATION_JSA_ID}/draft`,
        idempotentReplay: true,
      },
    };
  }

  async createCopy(
    context: OracleTransactionContext,
    plan: CopyExecutionPlan,
    number: { number: string; scopeKey: string },
    request: CopyRequestIdentity,
    actor: { userId: string; username: string; displayName: string },
  ): Promise<JsaCopyResult> {
    const jsaId = await this.next(context, 'SEQ_JSA_MASTER');
    const versionId = await this.next(context, 'SEQ_JSA_VERSION');
    const provenanceId = await this.next(context, 'SEQ_JSA_COPY_PROVENANCE');
    const destination = plan.destination;
    await context.connection.execute(
      `INSERT INTO JSA_MASTER(
        JSA_ID,JSA_NUMBER,NUMBER_SCOPE_KEY,NUMBER_STATUS,
        OWNER_SITE_ID,RIG_ID,DEPARTMENT_ID,ORIGIN_SITE_ID,CREATED_SITE_ID,UPDATED_SITE_ID,
        CREATOR_USER_ID,LIFECYCLE_STATUS,CREATED_BY,UPDATED_BY)
       VALUES(:jsaId,:jsaNumber,:scopeKey,'TEMPORARY',
        :siteId,:rigId,:departmentId,:siteId,:siteId,:siteId,
        :userId,'DRAFT',:username,:username)`,
      {
        jsaId,
        jsaNumber: number.number,
        scopeKey: number.scopeKey,
        siteId: destination.siteId,
        rigId: destination.rigId,
        departmentId: destination.departmentId,
        userId: actor.userId,
        username: actor.username,
      },
    );
    await context.connection.execute(
      `INSERT INTO JSA_VERSION(
        JSA_VERSION_ID,JSA_ID,VERSION_NUMBER,BASE_VERSION_ID,VERSION_STATUS,
        OWNER_SITE_ID,RIG_ID,DEPARTMENT_ID,MATRIX_VERSION_ID,LANGUAGE_ID,JOB_TITLE,
        CREATED_BY,UPDATED_BY)
       VALUES(:versionId,:jsaId,1,NULL,'DRAFT',
        :siteId,:rigId,:departmentId,:matrixVersionId,:languageId,:jobTitle,
        :username,:username)`,
      {
        versionId,
        jsaId,
        siteId: destination.siteId,
        rigId: destination.rigId,
        departmentId: destination.departmentId,
        matrixVersionId: plan.destinationMatrix.id,
        languageId: plan.languageId,
        jobTitle: plan.source.jobTitle ?? null,
        username: actor.username,
      },
    );
    await context.connection.execute(
      `INSERT INTO JSA_COPY_PROVENANCE(
        COPY_PROVENANCE_ID,DESTINATION_JSA_ID,DESTINATION_VERSION_ID,SOURCE_JSA_ID,SOURCE_VERSION_ID,
        SOURCE_SITE_ID,SOURCE_RIG_ID,COPY_REASON,COPIED_BY_USER_ID,
        COPIED_BY_USERNAME,COPIED_BY_DISPLAY_NAME,CREATED_SITE_ID,
        REQUEST_KEY,REQUEST_HASH,CREATED_BY)
       VALUES(:provenanceId,:destinationJsaId,:destinationVersionId,:sourceJsaId,:sourceVersionId,
        :sourceSiteId,:sourceRigId,:reason,:userId,:username,:displayName,:createdSiteId,
        :requestKey,:requestHash,:username)`,
      {
        provenanceId,
        destinationJsaId: jsaId,
        destinationVersionId: versionId,
        sourceJsaId: plan.source.jsaId,
        sourceVersionId: plan.source.versionId,
        sourceSiteId: plan.source.siteId,
        sourceRigId: plan.source.rigId,
        reason: request.reason,
        userId: actor.userId,
        username: actor.username,
        displayName: actor.displayName || null,
        createdSiteId: destination.siteId,
        requestKey: request.requestKey,
        requestHash: request.requestHash,
      },
    );

    const promptMap = this.mappingByCode(plan.mappings.prompts);
    for (const prompt of plan.aggregate.prompts) {
      const mapped = promptMap.get(prompt.code.toUpperCase());
      if (!mapped?.destinationId) continue;
      const id = await this.next(context, 'SEQ_JSA_VER_PROMPT');
      await context.connection.execute(
        `INSERT INTO JSA_VERSION_PROMPT(
          VERSION_PROMPT_ID,JSA_VERSION_ID,LOGICAL_KEY,PROMPT_ID,
          PROMPT_CODE_SNAPSHOT,PROMPT_LABEL_SNAPSHOT,SELECTED_FLAG,RESPONSE_NOTE,
          CREATED_BY,UPDATED_BY)
         VALUES(:id,:versionId,:id,:promptId,:code,:name,'Y',:note,:actor,:actor)`,
        {
          id,
          versionId,
          promptId: mapped.destinationId,
          code: mapped.destinationCode,
          name: mapped.destinationName,
          note: prompt.responseNote ?? null,
          actor: actor.username,
        },
      );
    }

    const taskIds = new Map<string, string>();
    for (const task of plan.aggregate.tasks)
      taskIds.set(task.id, await this.next(context, 'SEQ_JSA_VER_TASK'));
    for (const task of plan.aggregate.tasks) {
      const id = taskIds.get(task.id)!;
      const parentId = task.parentId ? taskIds.get(task.parentId) : undefined;
      if (task.parentId && !parentId)
        throw new StateConflictError('Source Task hierarchy changed during copy');
      await context.connection.execute(
        `INSERT INTO JSA_VERSION_TASK(
          VERSION_TASK_ID,JSA_VERSION_ID,LOGICAL_KEY,PARENT_TASK_ID,TASK_NUMBER,
          TASK_TITLE,TASK_DESCRIPTION,DISPLAY_ORDER,CREATED_BY,UPDATED_BY)
         VALUES(:id,:versionId,:id,:parentId,:taskNumber,:title,:description,
          :displayOrder,:actor,:actor)`,
        {
          id,
          versionId,
          parentId: parentId ?? null,
          taskNumber: task.number ?? null,
          title: task.title,
          description: task.description ?? null,
          displayOrder: task.displayOrder,
          actor: actor.username,
        },
      );
    }

    const hazardIds = new Map<string, string>();
    for (const hazard of plan.aggregate.hazards) {
      const id = await this.next(context, 'SEQ_JSA_VER_HAZARD');
      hazardIds.set(hazard.id, id);
      const taskId = taskIds.get(hazard.taskId);
      if (!taskId) throw new StateConflictError('Source Hazard Task changed during copy');
      const preserve = plan.riskCopyMode === 'PRESERVED';
      await context.connection.execute(
        `INSERT INTO JSA_VERSION_HAZARD(
          VERSION_HAZARD_ID,JSA_VERSION_ID,LOGICAL_KEY,VERSION_TASK_ID,HAZARD_TEXT,DISPLAY_ORDER,
          INITIAL_LIKELIHOOD_ID,INITIAL_SEVERITY_ID,INITIAL_CELL_ID,INITIAL_RATING_CODE,
          INITIAL_RESULT_CODE,INITIAL_RESULT_NAME,INITIAL_PROHIBITED_FLAG,
          RESIDUAL_LIKELIHOOD_ID,RESIDUAL_SEVERITY_ID,RESIDUAL_CELL_ID,RESIDUAL_RATING_CODE,
          RESIDUAL_RESULT_CODE,RESIDUAL_RESULT_NAME,RESIDUAL_PROHIBITED_FLAG,
          CREATED_BY,UPDATED_BY)
         VALUES(:id,:versionId,:id,:taskId,:text,:displayOrder,
          :initialLikelihoodId,:initialSeverityId,:initialCellId,:initialRatingCode,
          :initialResultCode,:initialResultName,:initialProhibited,
          :residualLikelihoodId,:residualSeverityId,:residualCellId,:residualRatingCode,
          :residualResultCode,:residualResultName,:residualProhibited,:actor,:actor)`,
        {
          id,
          versionId,
          taskId,
          text: hazard.text,
          displayOrder: hazard.displayOrder,
          initialLikelihoodId: preserve ? (hazard.initialLikelihoodId ?? null) : null,
          initialSeverityId: preserve ? (hazard.initialSeverityId ?? null) : null,
          initialCellId: preserve ? (hazard.initialCellId ?? null) : null,
          initialRatingCode: preserve ? (hazard.initialRatingCode ?? null) : null,
          initialResultCode: preserve ? (hazard.initialResultCode ?? null) : null,
          initialResultName: preserve ? (hazard.initialResultName ?? null) : null,
          initialProhibited: preserve
            ? hazard.initialProhibited === undefined
              ? null
              : hazard.initialProhibited
                ? 'Y'
                : 'N'
            : null,
          residualLikelihoodId: preserve ? (hazard.residualLikelihoodId ?? null) : null,
          residualSeverityId: preserve ? (hazard.residualSeverityId ?? null) : null,
          residualCellId: preserve ? (hazard.residualCellId ?? null) : null,
          residualRatingCode: preserve ? (hazard.residualRatingCode ?? null) : null,
          residualResultCode: preserve ? (hazard.residualResultCode ?? null) : null,
          residualResultName: preserve ? (hazard.residualResultName ?? null) : null,
          residualProhibited: preserve
            ? hazard.residualProhibited === undefined
              ? null
              : hazard.residualProhibited
                ? 'Y'
                : 'N'
            : null,
          actor: actor.username,
        },
      );
    }
    for (const control of plan.aggregate.controls) {
      const hazardId = hazardIds.get(control.hazardId);
      if (!hazardId) throw new StateConflictError('Source Control Hazard changed during copy');
      const id = await this.next(context, 'SEQ_JSA_VER_CONTROL');
      await context.connection.execute(
        `INSERT INTO JSA_VERSION_CONTROL(
          VERSION_CONTROL_ID,JSA_VERSION_ID,VERSION_HAZARD_ID,LOGICAL_KEY,
          CONTROL_TEXT,DISPLAY_ORDER,CREATED_BY,UPDATED_BY)
         VALUES(:id,:versionId,:hazardId,:id,:text,:displayOrder,:actor,:actor)`,
        {
          id,
          versionId,
          hazardId,
          text: control.text,
          displayOrder: control.displayOrder,
          actor: actor.username,
        },
      );
    }

    const stepIds = new Map<string, string>();
    for (const step of plan.aggregate.steps) {
      const id = await this.next(context, 'SEQ_JSA_VER_BASIC_STEP');
      stepIds.set(step.id, id);
      const taskId = step.taskId ? taskIds.get(step.taskId) : undefined;
      if (step.taskId && !taskId)
        throw new StateConflictError('Source Basic Step Task changed during copy');
      await context.connection.execute(
        `INSERT INTO JSA_VERSION_BASIC_STEP(
          BASIC_STEP_ID,JSA_VERSION_ID,LOGICAL_KEY,VERSION_TASK_ID,STEP_NUMBER,
          STEP_TEXT,DISPLAY_ORDER,NO_TOOL_REQUIRED_FLAG,CREATED_BY,UPDATED_BY)
         VALUES(:id,:versionId,:id,:taskId,:stepNumber,:text,:displayOrder,:noTool,:actor,:actor)`,
        {
          id,
          versionId,
          taskId: taskId ?? null,
          stepNumber: step.number ?? null,
          text: step.text,
          displayOrder: step.displayOrder,
          noTool: step.noToolRequired ? 'Y' : 'N',
          actor: actor.username,
        },
      );
    }
    await this.insertPositions(
      context,
      'JSA_VER_BASIC_STEP_PERFORMER',
      'STEP_PERFORMER_ID',
      'SEQ_JSA_VER_STEP_PERF',
      versionId,
      stepIds,
      plan.aggregate.performers,
      this.mappingByCode(plan.mappings.performers),
      actor.username,
    );
    await this.insertPositions(
      context,
      'JSA_VER_BASIC_STEP_SUPERVISOR',
      'STEP_SUPERVISOR_ID',
      'SEQ_JSA_VER_STEP_SUP',
      versionId,
      stepIds,
      plan.aggregate.supervisors,
      this.mappingByCode(plan.mappings.supervisors),
      actor.username,
    );
    const toolMap = this.mappingByCode(plan.mappings.tools);
    for (const assignment of plan.aggregate.tools) {
      if (assignment.noToolRequired) continue;
      const mapped = toolMap.get(assignment.code.toUpperCase());
      const stepId = stepIds.get(assignment.stepId);
      if (!mapped?.destinationId || !stepId)
        throw new StateConflictError('Tool mapping changed during copy');
      const id = await this.next(context, 'SEQ_JSA_VER_STEP_TOOL');
      await context.connection.execute(
        `INSERT INTO JSA_VER_BASIC_STEP_TOOL(
          STEP_TOOL_ID,JSA_VERSION_ID,BASIC_STEP_ID,LOGICAL_KEY,TOOL_ID,
          TOOL_CODE_SNAPSHOT,TOOL_NAME_SNAPSHOT,DISPLAY_ORDER,CREATED_BY,UPDATED_BY)
         VALUES(:id,:versionId,:stepId,:id,:sourceId,:code,:name,:displayOrder,:actor,:actor)`,
        {
          id,
          versionId,
          stepId,
          sourceId: mapped.destinationId,
          code: mapped.destinationCode,
          name: mapped.destinationName,
          displayOrder: assignment.displayOrder,
          actor: actor.username,
        },
      );
    }

    const pointer = await context.connection.execute(
      `UPDATE JSA_MASTER SET WORKING_VERSION_ID=:versionId,
        UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
       WHERE JSA_ID=:jsaId AND CURRENT_VERSION_ID IS NULL AND WORKING_VERSION_ID IS NULL
        AND LIFECYCLE_STATUS='DRAFT'`,
      { versionId, actor: actor.username, jsaId },
    );
    if (pointer.rowsAffected !== 1)
      throw new StateConflictError('Destination Working pointer could not be established');
    return {
      destinationJsaId: jsaId,
      destinationWorkingVersionId: versionId,
      temporaryJsaNumber: number.number,
      destination,
      sourceJsaId: plan.source.jsaId,
      sourceVersionId: plan.source.versionId,
      sourceJsaNumber: plan.source.jsaNumber,
      sourceMatrix: plan.sourceMatrix,
      destinationMatrix: plan.destinationMatrix,
      riskCopyMode: plan.riskCopyMode,
      matrixReassessmentRequired: plan.riskCopyMode === 'CLEARED',
      excludedAttachmentCount: plan.aggregate.attachmentNames.length,
      promptWarningCount: plan.mappings.prompts.filter((item) => item.status !== 'MAPPED').length,
      masterRowVersion: '2',
      versionRowVersion: '1',
      route: `/jsa/${jsaId}/draft`,
      idempotentReplay: false,
    };
  }

  async provenance(
    context: OracleTransactionContext,
    destinationJsaId: string,
  ): Promise<JsaCopyProvenance | undefined> {
    assertOracleId(destinationJsaId, 'destinationJsaId');
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(P.DESTINATION_JSA_ID) DESTINATION_JSA_ID,
              TO_CHAR(P.DESTINATION_VERSION_ID) DESTINATION_VERSION_ID,
              TO_CHAR(P.SOURCE_JSA_ID) SOURCE_JSA_ID,
              TO_CHAR(P.SOURCE_VERSION_ID) SOURCE_VERSION_ID,S.JSA_NUMBER,
              TO_CHAR(P.SOURCE_SITE_ID) SOURCE_SITE_ID,SS.SITE_CODE,SS.SITE_NAME,
              TO_CHAR(P.SOURCE_RIG_ID) SOURCE_RIG_ID,SR.RIG_CODE,SR.RIG_NAME,
              SV.VERSION_NUMBER,SV.VERSION_LABEL,
              TO_CHAR(P.COPIED_BY_USER_ID) COPIED_BY_USER_ID,
              P.COPIED_BY_USERNAME,P.COPIED_BY_DISPLAY_NAME,P.COPIED_AT,P.COPY_REASON
              ,CASE WHEN SV.MATRIX_VERSION_ID=DV.MATRIX_VERSION_ID
                THEN 'PRESERVED' ELSE 'CLEARED' END RISK_COPY_MODE
              ,(SELECT COUNT(*) FROM JSA_VERSION_ATTACHMENT A
                 WHERE A.JSA_VERSION_ID=P.SOURCE_VERSION_ID AND A.IS_ACTIVE='Y')
                 EXCLUDED_ATTACHMENT_COUNT
       FROM JSA_COPY_PROVENANCE P
       JOIN JSA_MASTER D ON D.JSA_ID=P.DESTINATION_JSA_ID
       JOIN JSA_VERSION DV ON DV.JSA_VERSION_ID=P.DESTINATION_VERSION_ID
       JOIN JSA_MASTER S ON S.JSA_ID=P.SOURCE_JSA_ID
       JOIN JSA_VERSION SV ON SV.JSA_VERSION_ID=P.SOURCE_VERSION_ID
        AND SV.JSA_ID=P.SOURCE_JSA_ID
       JOIN SYS_SITE SS ON SS.SITE_ID=P.SOURCE_SITE_ID
       JOIN SYS_RIG SR ON SR.RIG_ID=P.SOURCE_RIG_ID AND SR.SITE_ID=P.SOURCE_SITE_ID
       WHERE P.DESTINATION_JSA_ID=:destinationJsaId`,
      { destinationJsaId },
      options,
    );
    const row = result.rows?.[0];
    if (!row) return undefined;
    return {
      destinationJsaId: row.DESTINATION_JSA_ID,
      destinationVersionId: row.DESTINATION_VERSION_ID,
      sourceJsaId: row.SOURCE_JSA_ID,
      sourceVersionId: row.SOURCE_VERSION_ID,
      sourceJsaNumber: row.JSA_NUMBER,
      sourceSiteId: row.SOURCE_SITE_ID,
      sourceSiteCode: row.SITE_CODE,
      sourceSiteName: row.SITE_NAME,
      sourceRigId: row.SOURCE_RIG_ID,
      sourceRigCode: row.RIG_CODE,
      sourceRigName: row.RIG_NAME,
      sourceVersionNumber: row.VERSION_NUMBER,
      ...(row.VERSION_LABEL ? { sourceVersionLabel: row.VERSION_LABEL } : {}),
      copiedByUserId: row.COPIED_BY_USER_ID,
      copiedByUsername: row.COPIED_BY_USERNAME,
      ...(row.COPIED_BY_DISPLAY_NAME ? { copiedByDisplayName: row.COPIED_BY_DISPLAY_NAME } : {}),
      copiedAt: this.iso(row.COPIED_AT),
      copyReason: row.COPY_REASON,
      riskCopyMode: row.RISK_COPY_MODE,
      matrixReassessmentRequired: row.RISK_COPY_MODE === 'CLEARED',
      excludedAttachmentCount: row.EXCLUDED_ATTACHMENT_COUNT,
    };
  }

  private async referenceCandidates(
    context: OracleTransactionContext,
    binds: { siteId: string; rigId: string; departmentId: string },
  ): Promise<[CopyReferenceCandidate[], CopyReferenceCandidate[], CopyReferenceCandidate[]]> {
    const scope = `(SCOPE_TYPE='GLOBAL'
      OR (SCOPE_TYPE='SITE' AND SITE_ID=:siteId)
      OR (SCOPE_TYPE='RIG' AND SITE_ID=:siteId AND RIG_ID=:rigId)
      OR (SCOPE_TYPE='DEPARTMENT' AND SITE_ID=:siteId AND RIG_ID=:rigId
        AND DEPARTMENT_ID=:departmentId))`;
    const promptScope = `(P.SCOPE_TYPE='GLOBAL'
      OR (P.SCOPE_TYPE='SITE' AND P.SITE_ID=:siteId)
      OR (P.SCOPE_TYPE='RIG' AND P.SITE_ID=:siteId AND P.RIG_ID=:rigId))`;
    const promptResult = await context.connection.execute<Row>(
      `SELECT TO_CHAR(P.PROMPT_ID) ID,P.PROMPT_CODE CODE,P.PROMPT_LABEL NAME
       FROM SYS_HAZARD_PROMPT P WHERE P.IS_ACTIVE='Y' AND ${promptScope}
       ORDER BY UPPER(P.PROMPT_CODE),P.PROMPT_ID`,
      { siteId: binds.siteId, rigId: binds.rigId },
      options,
    );
    const positionResult = await context.connection.execute<Row>(
      `SELECT TO_CHAR(POSITION_ID) ID,POSITION_CODE CODE,POSITION_NAME NAME
       FROM SYS_POSITION WHERE IS_ACTIVE='Y' AND ${scope}
       ORDER BY UPPER(POSITION_CODE),POSITION_ID`,
      binds,
      options,
    );
    const toolResult = await context.connection.execute<Row>(
      `SELECT TO_CHAR(T.TOOL_ID) ID,T.TOOL_CODE CODE,T.TOOL_NAME NAME
       FROM SYS_TOOL T
       JOIN SYS_TOOL_CATEGORY C ON C.TOOL_CATEGORY_ID=T.TOOL_CATEGORY_ID AND C.IS_ACTIVE='Y'
       WHERE T.IS_ACTIVE='Y' AND (T.SCOPE_TYPE='GLOBAL'
        OR (T.SCOPE_TYPE='SITE' AND T.SITE_ID=:siteId)
        OR (T.SCOPE_TYPE='RIG' AND T.SITE_ID=:siteId AND T.RIG_ID=:rigId)
        OR (T.SCOPE_TYPE='DEPARTMENT' AND T.SITE_ID=:siteId AND T.RIG_ID=:rigId
          AND T.DEPARTMENT_ID=:departmentId))
       ORDER BY UPPER(T.TOOL_CODE),T.TOOL_ID`,
      binds,
      options,
    );
    const map = (rows: Row[] | undefined) =>
      (rows ?? []).map((row) => ({ id: row.ID, code: row.CODE, name: row.NAME }));
    return [map(promptResult.rows), map(positionResult.rows), map(toolResult.rows)];
  }

  private async assignments(
    context: OracleTransactionContext,
    table: string,
    idColumn: string,
    prefix: string,
    versionId: string,
  ) {
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(${idColumn}) ID,TO_CHAR(BASIC_STEP_ID) STEP_ID,
              ${prefix}_CODE_SNAPSHOT CODE,${prefix}_NAME_SNAPSHOT NAME,DISPLAY_ORDER
       FROM ${table}
       WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y'
       ORDER BY DISPLAY_ORDER,${idColumn}`,
      { versionId },
      options,
    );
    return (result.rows ?? []).map((row) => ({
      id: row.ID,
      stepId: row.STEP_ID,
      code: row.CODE,
      name: row.NAME,
      displayOrder: row.DISPLAY_ORDER,
    }));
  }

  private async invalidRiskReferences(
    context: OracleTransactionContext,
    versionId: string,
    matrixVersionId: string,
  ) {
    const result = await context.connection.execute<Row>(
      `SELECT COUNT(*) ITEM_COUNT
       FROM JSA_VERSION_HAZARD H
       WHERE H.JSA_VERSION_ID=:versionId AND H.IS_ACTIVE='Y' AND (
         H.INITIAL_LIKELIHOOD_ID IS NULL OR H.INITIAL_SEVERITY_ID IS NULL
         OR H.INITIAL_CELL_ID IS NULL OR H.RESIDUAL_LIKELIHOOD_ID IS NULL
         OR H.RESIDUAL_SEVERITY_ID IS NULL OR H.RESIDUAL_CELL_ID IS NULL
         OR H.RESIDUAL_SEVERITY_ID<>H.INITIAL_SEVERITY_ID
         OR NOT EXISTS (
           SELECT 1 FROM JSA_RISK_MATRIX_CELL C
           WHERE C.MATRIX_CELL_ID=H.INITIAL_CELL_ID
            AND C.MATRIX_VERSION_ID=:matrixVersionId
            AND C.LIKELIHOOD_ID=H.INITIAL_LIKELIHOOD_ID
            AND C.SEVERITY_ID=H.INITIAL_SEVERITY_ID AND C.IS_ACTIVE='Y')
         OR NOT EXISTS (
           SELECT 1 FROM JSA_RISK_MATRIX_CELL C
           WHERE C.MATRIX_CELL_ID=H.RESIDUAL_CELL_ID
            AND C.MATRIX_VERSION_ID=:matrixVersionId
            AND C.LIKELIHOOD_ID=H.RESIDUAL_LIKELIHOOD_ID
            AND C.SEVERITY_ID=H.RESIDUAL_SEVERITY_ID AND C.IS_ACTIVE='Y')
       )`,
      { versionId, matrixVersionId },
      options,
    );
    return result.rows?.[0]?.ITEM_COUNT ?? 0;
  }

  private async insertPositions(
    context: OracleTransactionContext,
    table: string,
    idColumn: string,
    sequence: string,
    versionId: string,
    stepIds: Map<string, string>,
    assignments: Array<{
      stepId: string;
      code: string;
      displayOrder: number;
    }>,
    mappings: Map<
      string,
      { destinationId?: string; destinationCode?: string; destinationName?: string }
    >,
    actor: string,
  ) {
    for (const assignment of assignments) {
      const mapped = mappings.get(assignment.code.toUpperCase());
      const stepId = stepIds.get(assignment.stepId);
      if (!mapped?.destinationId || !stepId)
        throw new StateConflictError('Position mapping changed during copy');
      const id = await this.next(context, sequence);
      await context.connection.execute(
        `INSERT INTO ${table}(
          ${idColumn},JSA_VERSION_ID,BASIC_STEP_ID,LOGICAL_KEY,POSITION_ID,
          POSITION_CODE_SNAPSHOT,POSITION_NAME_SNAPSHOT,DISPLAY_ORDER,CREATED_BY,UPDATED_BY)
         VALUES(:id,:versionId,:stepId,:id,:sourceId,:code,:name,:displayOrder,:actor,:actor)`,
        {
          id,
          versionId,
          stepId,
          sourceId: mapped.destinationId,
          code: mapped.destinationCode,
          name: mapped.destinationName,
          displayOrder: assignment.displayOrder,
          actor,
        },
      );
    }
  }

  private mappingByCode(
    mappings: Array<{
      sourceCode: string;
      destinationId?: string;
      destinationCode?: string;
      destinationName?: string;
    }>,
  ) {
    return new Map(mappings.map((mapping) => [mapping.sourceCode.toUpperCase(), mapping]));
  }

  private hazard(row: Row) {
    return {
      id: row.ID,
      taskId: row.TASK_ID,
      text: row.HAZARD_TEXT,
      displayOrder: row.DISPLAY_ORDER,
      ...this.optional(row, [
        'INITIAL_LIKELIHOOD_ID',
        'INITIAL_SEVERITY_ID',
        'INITIAL_CELL_ID',
        'INITIAL_RATING_CODE',
        'INITIAL_RESULT_CODE',
        'INITIAL_RESULT_NAME',
        'RESIDUAL_LIKELIHOOD_ID',
        'RESIDUAL_SEVERITY_ID',
        'RESIDUAL_CELL_ID',
        'RESIDUAL_RATING_CODE',
        'RESIDUAL_RESULT_CODE',
        'RESIDUAL_RESULT_NAME',
      ]),
      ...(row.INITIAL_PROHIBITED_FLAG
        ? { initialProhibited: row.INITIAL_PROHIBITED_FLAG === 'Y' }
        : {}),
      ...(row.RESIDUAL_PROHIBITED_FLAG
        ? { residualProhibited: row.RESIDUAL_PROHIBITED_FLAG === 'Y' }
        : {}),
    };
  }

  private optional(row: Row, fields: string[]) {
    const output: Record<string, string> = {};
    for (const field of fields) {
      if (row[field] === null || row[field] === undefined) continue;
      const camel = field
        .toLowerCase()
        .replace(/_([a-z])/g, (_, character: string) => character.toUpperCase());
      output[camel] = row[field];
    }
    return output;
  }

  private matrix(row: Row): JsaCopyMatrixSummary {
    return {
      id: row.MATRIX_VERSION_ID,
      code: row.MATRIX_CODE,
      name: row.MATRIX_NAME,
      versionCode: row.VERSION_CODE,
      dimension: row.DIMENSION_SIZE,
    };
  }

  private namedMatrix(row: Row, prefix: 'SOURCE' | 'DEST'): JsaCopyMatrixSummary {
    return {
      id: row[`${prefix}_MATRIX_ID`],
      code: row[`${prefix}_MATRIX_CODE`],
      name: row[`${prefix}_MATRIX_NAME`],
      versionCode: row[`${prefix}_MATRIX_VERSION`],
      dimension: row[`${prefix}_DIMENSION`],
    };
  }

  private iso(value: Date | string) {
    return value instanceof Date ? value.toISOString() : value;
  }

  private async next(context: OracleTransactionContext, sequence: string) {
    const allowed = new Set([
      'SEQ_JSA_MASTER',
      'SEQ_JSA_VERSION',
      'SEQ_JSA_COPY_PROVENANCE',
      'SEQ_JSA_VER_PROMPT',
      'SEQ_JSA_VER_TASK',
      'SEQ_JSA_VER_HAZARD',
      'SEQ_JSA_VER_CONTROL',
      'SEQ_JSA_VER_BASIC_STEP',
      'SEQ_JSA_VER_STEP_PERF',
      'SEQ_JSA_VER_STEP_SUP',
      'SEQ_JSA_VER_STEP_TOOL',
    ]);
    if (!allowed.has(sequence)) throw new Error('Unsupported JSA copy sequence');
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
