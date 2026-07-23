import { Injectable } from '@nestjs/common';
import oracledb from 'oracledb';
import type {
  JsaDraftHeader,
  JsaPositionSnapshot,
  JsaRiskSelection,
  JsaToolSnapshot,
} from '@jsams/shared-types';
import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import {
  OptimisticLockError,
  StateConflictError,
  ValidationError,
} from '../../../common/errors/application-errors';
import { assertOracleId } from '../../../common/oracle/oracle-id';
import type {
  CreateDraftInput,
  DraftAccessRecord,
  PositionInput,
  ProcedureInput,
  RiskSnapshot,
  SaveDraftContentInput,
  ToolInput,
  UpdateDraftHeaderInput,
} from '../domain/jsa-draft.types';
import type { DraftLoadRecord, JsaDraftRepository } from '../domain/jsa-draft.repository';

const options = { outFormat: oracledb.OUT_FORMAT_OBJECT };
type Row = Record<string, any>;

@Injectable()
export class OracleJsaDraftRepository implements JsaDraftRepository {
  async validateCreate(
    context: OracleTransactionContext,
    input: CreateDraftInput,
  ): Promise<{ matrixVersionId: string }> {
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(R.RIG_ID) RIG_ID,TO_CHAR(D.DEPARTMENT_ID) DEPARTMENT_ID,TO_CHAR(J.JOB_TYPE_ID) JOB_TYPE_ID,
      (SELECT MIN(TO_CHAR(A.MATRIX_VERSION_ID)) FROM JSA_RIG_MATRIX_ASSIGNMENT A JOIN JSA_RISK_MATRIX_VERSION V ON V.MATRIX_VERSION_ID=A.MATRIX_VERSION_ID JOIN JSA_RISK_MATRIX M ON M.MATRIX_ID=V.MATRIX_ID WHERE A.RIG_ID=R.RIG_ID AND A.IS_ACTIVE='Y' AND A.EFFECTIVE_FROM<=SYSTIMESTAMP AND (A.EFFECTIVE_TO IS NULL OR A.EFFECTIVE_TO>SYSTIMESTAMP) AND V.IS_ACTIVE='Y' AND M.IS_ACTIVE='Y') MATRIX_VERSION_ID,
      (SELECT COUNT(*) FROM JSA_RIG_MATRIX_ASSIGNMENT A WHERE A.RIG_ID=R.RIG_ID AND A.IS_ACTIVE='Y' AND A.EFFECTIVE_FROM<=SYSTIMESTAMP AND (A.EFFECTIVE_TO IS NULL OR A.EFFECTIVE_TO>SYSTIMESTAMP)) MATRIX_COUNT
      FROM SYS_RIG R JOIN SYS_DEPARTMENT D ON D.DEPARTMENT_ID=:departmentId AND D.RIG_ID=R.RIG_ID AND D.SITE_ID=R.SITE_ID JOIN SYS_JOB_TYPE J ON J.JOB_TYPE_ID=:jobTypeId
      WHERE R.RIG_ID=:rigId AND R.SITE_ID=:siteId AND R.IS_ACTIVE='Y' AND D.IS_ACTIVE='Y' AND J.IS_ACTIVE='Y'
      AND (J.SCOPE_TYPE='GLOBAL' OR (J.SITE_ID=:siteId AND (J.RIG_ID IS NULL OR J.RIG_ID=:rigId) AND (J.DEPARTMENT_ID IS NULL OR J.DEPARTMENT_ID=:departmentId)))`,
      {
        siteId: input.ownerSiteId,
        rigId: input.rigId,
        departmentId: input.departmentId,
        jobTypeId: input.jobTypeId,
      },
      options,
    );
    const row = result.rows?.[0];
    if (!row)
      throw new ValidationError(
        'Site, Rig, Department, or Job Type is not an active compatible selection',
      );
    if (row.MATRIX_COUNT !== 1 || !row.MATRIX_VERSION_ID)
      throw new StateConflictError(
        row.MATRIX_COUNT === 0
          ? 'No effective Matrix Version is configured for this Rig'
          : 'Multiple effective Matrix Versions are configured for this Rig',
      );
    const complete = await context.connection.execute<Row>(
      `SELECT M.DIMENSION_SIZE,(SELECT COUNT(*) FROM JSA_RISK_LIKELIHOOD L WHERE L.MATRIX_VERSION_ID=:id AND L.IS_ACTIVE='Y') L_COUNT,(SELECT COUNT(*) FROM JSA_RISK_SEVERITY S WHERE S.MATRIX_VERSION_ID=:id AND S.IS_ACTIVE='Y') S_COUNT,(SELECT COUNT(*) FROM JSA_RISK_MATRIX_CELL C WHERE C.MATRIX_VERSION_ID=:id AND C.IS_ACTIVE='Y') C_COUNT FROM JSA_RISK_MATRIX_VERSION V JOIN JSA_RISK_MATRIX M ON M.MATRIX_ID=V.MATRIX_ID WHERE V.MATRIX_VERSION_ID=:id`,
      { id: row.MATRIX_VERSION_ID },
      options,
    );
    const c = complete.rows?.[0];
    if (
      !c ||
      c.L_COUNT !== c.DIMENSION_SIZE ||
      c.S_COUNT !== c.DIMENSION_SIZE ||
      c.C_COUNT !== c.DIMENSION_SIZE * c.DIMENSION_SIZE
    )
      throw new StateConflictError('The effective Matrix Version is incomplete');
    if (input.languageId) {
      const lang = await context.connection.execute<Row>(
        `SELECT COUNT(*) C FROM SYS_LANGUAGE WHERE LANGUAGE_ID=:id AND IS_ACTIVE='Y'`,
        { id: input.languageId },
        options,
      );
      if (lang.rows?.[0]?.C !== 1) throw new ValidationError('Language is not active');
    }
    return { matrixVersionId: row.MATRIX_VERSION_ID };
  }

  async create(
    context: OracleTransactionContext,
    input: CreateDraftInput,
    matrixVersionId: string,
    number: { number: string; scopeKey: string },
    userId: string,
    actor: string,
  ): Promise<string> {
    const jsaId = await this.next(context, 'SEQ_JSA_MASTER');
    const versionId = await this.next(context, 'SEQ_JSA_VERSION');
    await context.connection.execute(
      `INSERT INTO JSA_MASTER(JSA_ID,JSA_NUMBER,NUMBER_SCOPE_KEY,OWNER_SITE_ID,RIG_ID,DEPARTMENT_ID,ORIGIN_SITE_ID,CREATED_SITE_ID,UPDATED_SITE_ID,CREATOR_USER_ID,CREATED_BY,UPDATED_BY) VALUES(:jsaId,:jsaNumber,:scopeKey,:ownerSiteId,:rigId,:departmentId,:ownerSiteId,:ownerSiteId,:ownerSiteId,:userId,:actor,:actor)`,
      {
        jsaId,
        jsaNumber: number.number,
        scopeKey: number.scopeKey,
        ownerSiteId: input.ownerSiteId,
        rigId: input.rigId,
        departmentId: input.departmentId,
        userId,
        actor,
      },
    );
    await context.connection.execute(
      `INSERT INTO JSA_VERSION(JSA_VERSION_ID,JSA_ID,VERSION_NUMBER,OWNER_SITE_ID,RIG_ID,DEPARTMENT_ID,JOB_TYPE_ID,MATRIX_VERSION_ID,LANGUAGE_ID,CREATED_BY,UPDATED_BY) VALUES(:versionId,:jsaId,1,:ownerSiteId,:rigId,:departmentId,:jobTypeId,:matrixVersionId,:languageId,:actor,:actor)`,
      { versionId, jsaId, ...input, matrixVersionId, languageId: input.languageId ?? null, actor },
    );
    await context.connection.execute(
      `UPDATE JSA_MASTER SET WORKING_VERSION_ID=:versionId WHERE JSA_ID=:jsaId`,
      { versionId, jsaId },
    );
    return jsaId;
  }

  async access(
    context: OracleTransactionContext,
    jsaId: string,
    lock = false,
  ): Promise<DraftAccessRecord | undefined> {
    assertOracleId(jsaId, 'jsaId');
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(M.JSA_ID) JSA_ID,TO_CHAR(V.JSA_VERSION_ID) VERSION_ID,TO_CHAR(M.OWNER_SITE_ID) SITE_ID,TO_CHAR(M.RIG_ID) RIG_ID,TO_CHAR(M.DEPARTMENT_ID) DEPARTMENT_ID,TO_CHAR(M.CREATOR_USER_ID) CREATOR_USER_ID,M.LIFECYCLE_STATUS STATUS,V.VERSION_STATUS,TO_CHAR(M.ROW_VERSION) ROW_VERSION,TO_CHAR(V.ROW_VERSION) VERSION_ROW_VERSION FROM JSA_MASTER M JOIN JSA_VERSION V ON V.JSA_VERSION_ID=M.WORKING_VERSION_ID AND V.JSA_ID=M.JSA_ID WHERE M.JSA_ID=:jsaId${lock ? ' FOR UPDATE' : ''}`,
      { jsaId },
      options,
    );
    const r = result.rows?.[0];
    return r
      ? {
          jsaId: r.JSA_ID,
          versionId: r.VERSION_ID,
          siteId: r.SITE_ID,
          rigId: r.RIG_ID,
          departmentId: r.DEPARTMENT_ID,
          creatorUserId: r.CREATOR_USER_ID,
          status: r.STATUS,
          versionStatus: r.VERSION_STATUS,
          rowVersion: r.ROW_VERSION,
          versionRowVersion: r.VERSION_ROW_VERSION,
        }
      : undefined;
  }

  async updateHeader(
    context: OracleTransactionContext,
    access: DraftAccessRecord,
    input: UpdateDraftHeaderInput,
    actor: string,
  ): Promise<void> {
    const result = await context.connection.execute(
      `UPDATE JSA_VERSION SET JOB_TYPE_ID=:jobTypeId,LANGUAGE_ID=:languageId,JOB_TITLE=:jobTitle,JOB_DESCRIPTION=:jobDescription,LOCATION_TEXT=:location,PERSONNEL_TEXT=:personnel,PTW_REQUIRED_FLAG=:ptwRequired,PTW_REFERENCE=:ptwReference,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE JSA_VERSION_ID=:versionId AND ROW_VERSION=:versionRowVersion AND VERSION_STATUS IN ('DRAFT','RETURNED')`,
      {
        ...input,
        languageId: input.languageId ?? null,
        jobTitle: input.jobTitle ?? null,
        jobDescription: input.jobDescription ?? null,
        location: input.location ?? null,
        personnel: input.personnel ?? null,
        ptwRequired: input.ptwRequired ? 'Y' : 'N',
        ptwReference: input.ptwReference ?? null,
        actor,
        versionId: access.versionId,
      },
    );
    if (result.rowsAffected !== 1) throw new OptimisticLockError();
    const master = await context.connection.execute(
      `UPDATE JSA_MASTER SET UPDATED_SITE_ID=OWNER_SITE_ID,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE JSA_ID=:jsaId AND ROW_VERSION=:rowVersion AND LIFECYCLE_STATUS='DRAFT'`,
      { actor, jsaId: access.jsaId, rowVersion: input.rowVersion },
    );
    if (master.rowsAffected !== 1) throw new OptimisticLockError();
  }

  async resolveRisk(
    context: OracleTransactionContext,
    matrixVersionId: string,
    input: { likelihoodId?: string; severityId?: string },
  ): Promise<RiskSnapshot | undefined> {
    if (!input.likelihoodId && !input.severityId) return undefined;
    if (!input.likelihoodId || !input.severityId)
      throw new ValidationError('Likelihood and Severity must be selected together');
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(C.LIKELIHOOD_ID) LIKELIHOOD_ID,TO_CHAR(C.SEVERITY_ID) SEVERITY_ID,TO_CHAR(C.MATRIX_CELL_ID) CELL_ID,C.RATING_CODE,R.RESULT_CODE,R.RESULT_NAME,R.PROHIBITED_FLAG FROM JSA_RISK_MATRIX_CELL C JOIN JSA_RISK_RESULT R ON R.RISK_RESULT_ID=C.RISK_RESULT_ID AND R.MATRIX_VERSION_ID=C.MATRIX_VERSION_ID WHERE C.MATRIX_VERSION_ID=:matrixVersionId AND C.LIKELIHOOD_ID=:likelihoodId AND C.SEVERITY_ID=:severityId AND C.IS_ACTIVE='Y' AND R.IS_ACTIVE='Y'`,
      { matrixVersionId, ...input },
      options,
    );
    const r = result.rows?.[0];
    if (!r)
      throw new ValidationError(
        'The selected Likelihood and Severity do not resolve in the draft Matrix Version',
      );
    return {
      likelihoodId: r.LIKELIHOOD_ID,
      severityId: r.SEVERITY_ID,
      cellId: r.CELL_ID,
      ...(r.RATING_CODE ? { ratingCode: r.RATING_CODE } : {}),
      resultCode: r.RESULT_CODE,
      resultName: r.RESULT_NAME,
      prohibited: r.PROHIBITED_FLAG === 'Y',
    };
  }

  async saveContent(
    context: OracleTransactionContext,
    access: DraftAccessRecord,
    input: SaveDraftContentInput,
    actor: string,
  ): Promise<void> {
    const version = await context.connection.execute(
      `UPDATE JSA_VERSION SET UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE JSA_VERSION_ID=:versionId AND ROW_VERSION=:rowVersion AND VERSION_STATUS IN ('DRAFT','RETURNED')`,
      { actor, versionId: access.versionId, rowVersion: input.versionRowVersion },
    );
    if (version.rowsAffected !== 1) throw new OptimisticLockError();
    const matrix = await context.connection.execute<Row>(
      `SELECT TO_CHAR(MATRIX_VERSION_ID) MATRIX_VERSION_ID FROM JSA_VERSION WHERE JSA_VERSION_ID=:id`,
      { id: access.versionId },
      options,
    );
    const matrixVersionId = matrix.rows?.[0]?.MATRIX_VERSION_ID as string;
    for (const table of [
      'JSA_VERSION_PROMPT_COVERAGE',
      'JSA_VER_BASIC_STEP_TOOL',
      'JSA_VER_BASIC_STEP_SUPERVISOR',
      'JSA_VER_BASIC_STEP_PERFORMER',
      'JSA_VERSION_ATTACHMENT',
      'JSA_VERSION_PROCEDURE_REF',
      'JSA_VERSION_BASIC_STEP',
      'JSA_VERSION_CONTROL',
      'JSA_VERSION_HAZARD',
      'JSA_VERSION_TASK',
      'JSA_VERSION_PROMPT',
    ])
      await context.connection.execute(
        `UPDATE ${table} SET IS_ACTIVE='N',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor WHERE JSA_VERSION_ID=:versionId`,
        { actor, versionId: access.versionId },
      );

    const promptIds = new Map<string, string>();
    for (const item of input.prompts) {
      const id = item.id ?? (await this.next(context, 'SEQ_JSA_VER_PROMPT'));
      const source = await this.lookup(
        context,
        `SELECT PROMPT_CODE CODE,PROMPT_LABEL NAME FROM SYS_HAZARD_PROMPT WHERE PROMPT_ID=:id AND IS_ACTIVE='Y'`,
        item.promptId,
        'Hazard Prompt',
      );
      if (item.id)
        await this.updateOne(
          context,
          `UPDATE JSA_VERSION_PROMPT SET PROMPT_ID=:sourceId,PROMPT_CODE_SNAPSHOT=:code,PROMPT_LABEL_SNAPSHOT=:name,SELECTED_FLAG=:selected,RESPONSE_NOTE=:note,IS_ACTIVE='Y',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE VERSION_PROMPT_ID=:id AND JSA_VERSION_ID=:versionId AND ROW_VERSION=:rowVersion`,
          {
            id,
            versionId: access.versionId,
            rowVersion: item.rowVersion,
            sourceId: item.promptId,
            code: source.CODE,
            name: source.NAME,
            selected: item.selected ? 'Y' : 'N',
            note: item.responseNote ?? null,
            actor,
          },
        );
      else
        await context.connection.execute(
          `INSERT INTO JSA_VERSION_PROMPT(VERSION_PROMPT_ID,JSA_VERSION_ID,LOGICAL_KEY,PROMPT_ID,PROMPT_CODE_SNAPSHOT,PROMPT_LABEL_SNAPSHOT,SELECTED_FLAG,RESPONSE_NOTE,CREATED_BY,UPDATED_BY) VALUES(:id,:versionId,:id,:sourceId,:code,:name,:selected,:note,:actor,:actor)`,
          {
            id,
            versionId: access.versionId,
            sourceId: item.promptId,
            code: source.CODE,
            name: source.NAME,
            selected: item.selected ? 'Y' : 'N',
            note: item.responseNote ?? null,
            actor,
          },
        );
      promptIds.set(item.ref, id);
    }

    const taskIds = new Map<string, string>();
    for (const item of input.tasks)
      taskIds.set(item.ref, item.id ?? (await this.next(context, 'SEQ_JSA_VER_TASK')));
    for (const item of input.tasks) {
      const id = taskIds.get(item.ref)!;
      const parentId = item.parentRef ? taskIds.get(item.parentRef) : undefined;
      if (item.parentRef && !parentId)
        throw new ValidationError('Task parent reference is invalid');
      const binds = {
        id,
        versionId: access.versionId,
        rowVersion: item.rowVersion,
        parentId: parentId ?? null,
        number: item.number ?? null,
        title: item.title,
        description: item.description ?? null,
        displayOrder: item.displayOrder,
        actor,
      };
      if (item.id)
        await this.updateOne(
          context,
          `UPDATE JSA_VERSION_TASK SET PARENT_TASK_ID=:parentId,TASK_NUMBER=:number,TASK_TITLE=:title,TASK_DESCRIPTION=:description,DISPLAY_ORDER=:displayOrder,IS_ACTIVE='Y',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE VERSION_TASK_ID=:id AND JSA_VERSION_ID=:versionId AND ROW_VERSION=:rowVersion`,
          binds,
        );
      else
        await context.connection.execute(
          `INSERT INTO JSA_VERSION_TASK(VERSION_TASK_ID,JSA_VERSION_ID,LOGICAL_KEY,PARENT_TASK_ID,TASK_NUMBER,TASK_TITLE,TASK_DESCRIPTION,DISPLAY_ORDER,CREATED_BY,UPDATED_BY) VALUES(:id,:versionId,:id,:parentId,:number,:title,:description,:displayOrder,:actor,:actor)`,
          binds,
        );
    }

    const hazardIds = new Map<string, string>();
    const controlIds = new Map<string, string>();
    for (const task of input.tasks)
      for (const hazard of task.hazards) {
        hazardIds.set(hazard.ref, hazard.id ?? (await this.next(context, 'SEQ_JSA_VER_HAZARD')));
        for (const control of hazard.controls)
          controlIds.set(
            control.ref,
            control.id ?? (await this.next(context, 'SEQ_JSA_VER_CONTROL')),
          );
      }
    for (const task of input.tasks)
      for (const item of task.hazards) {
        const id = hazardIds.get(item.ref)!;
        const taskId = taskIds.get(task.ref)!;
        const initial = await this.resolveRisk(context, matrixVersionId, item.initialRisk);
        const residual = await this.resolveRisk(context, matrixVersionId, item.residualRisk);
        const binds = {
          id,
          versionId: access.versionId,
          rowVersion: item.rowVersion,
          taskId,
          text: item.text,
          displayOrder: item.displayOrder,
          ...this.riskBinds('initial', initial),
          ...this.riskBinds('residual', residual),
          actor,
        };
        const set = `VERSION_TASK_ID=:taskId,HAZARD_TEXT=:text,DISPLAY_ORDER=:displayOrder,INITIAL_LIKELIHOOD_ID=:initialLikelihoodId,INITIAL_SEVERITY_ID=:initialSeverityId,INITIAL_CELL_ID=:initialCellId,INITIAL_RATING_CODE=:initialRatingCode,INITIAL_RESULT_CODE=:initialResultCode,INITIAL_RESULT_NAME=:initialResultName,INITIAL_PROHIBITED_FLAG=:initialProhibited,RESIDUAL_LIKELIHOOD_ID=:residualLikelihoodId,RESIDUAL_SEVERITY_ID=:residualSeverityId,RESIDUAL_CELL_ID=:residualCellId,RESIDUAL_RATING_CODE=:residualRatingCode,RESIDUAL_RESULT_CODE=:residualResultCode,RESIDUAL_RESULT_NAME=:residualResultName,RESIDUAL_PROHIBITED_FLAG=:residualProhibited`;
        if (item.id)
          await this.updateOne(
            context,
            `UPDATE JSA_VERSION_HAZARD SET ${set},IS_ACTIVE='Y',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE VERSION_HAZARD_ID=:id AND JSA_VERSION_ID=:versionId AND ROW_VERSION=:rowVersion`,
            binds,
          );
        else
          await context.connection.execute(
            `INSERT INTO JSA_VERSION_HAZARD(VERSION_HAZARD_ID,JSA_VERSION_ID,LOGICAL_KEY,VERSION_TASK_ID,HAZARD_TEXT,DISPLAY_ORDER,INITIAL_LIKELIHOOD_ID,INITIAL_SEVERITY_ID,INITIAL_CELL_ID,INITIAL_RATING_CODE,INITIAL_RESULT_CODE,INITIAL_RESULT_NAME,INITIAL_PROHIBITED_FLAG,RESIDUAL_LIKELIHOOD_ID,RESIDUAL_SEVERITY_ID,RESIDUAL_CELL_ID,RESIDUAL_RATING_CODE,RESIDUAL_RESULT_CODE,RESIDUAL_RESULT_NAME,RESIDUAL_PROHIBITED_FLAG,CREATED_BY,UPDATED_BY) VALUES(:id,:versionId,:id,:taskId,:text,:displayOrder,:initialLikelihoodId,:initialSeverityId,:initialCellId,:initialRatingCode,:initialResultCode,:initialResultName,:initialProhibited,:residualLikelihoodId,:residualSeverityId,:residualCellId,:residualRatingCode,:residualResultCode,:residualResultName,:residualProhibited,:actor,:actor)`,
            binds,
          );
        for (const control of item.controls) {
          const controlId = controlIds.get(control.ref)!;
          const cb = {
            id: controlId,
            versionId: access.versionId,
            rowVersion: control.rowVersion,
            hazardId: id,
            text: control.text,
            displayOrder: control.displayOrder,
            actor,
          };
          if (control.id)
            await this.updateOne(
              context,
              `UPDATE JSA_VERSION_CONTROL SET VERSION_HAZARD_ID=:hazardId,CONTROL_TEXT=:text,DISPLAY_ORDER=:displayOrder,IS_ACTIVE='Y',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE VERSION_CONTROL_ID=:id AND JSA_VERSION_ID=:versionId AND ROW_VERSION=:rowVersion`,
              cb,
            );
          else
            await context.connection.execute(
              `INSERT INTO JSA_VERSION_CONTROL(VERSION_CONTROL_ID,JSA_VERSION_ID,VERSION_HAZARD_ID,LOGICAL_KEY,CONTROL_TEXT,DISPLAY_ORDER,CREATED_BY,UPDATED_BY) VALUES(:id,:versionId,:hazardId,:id,:text,:displayOrder,:actor,:actor)`,
              cb,
            );
        }
      }

    const stepIds = new Map<string, string>();
    for (const item of input.basicSteps)
      stepIds.set(item.ref, item.id ?? (await this.next(context, 'SEQ_JSA_VER_BASIC_STEP')));
    for (const item of input.basicSteps) {
      const id = stepIds.get(item.ref)!;
      const taskId = item.taskRef ? taskIds.get(item.taskRef) : undefined;
      if (item.taskRef && !taskId)
        throw new ValidationError('Basic Job Step task reference is invalid');
      const binds = {
        id,
        versionId: access.versionId,
        rowVersion: item.rowVersion,
        taskId: taskId ?? null,
        number: item.number ?? null,
        text: item.text,
        displayOrder: item.displayOrder,
        noTool: item.noToolRequired ? 'Y' : 'N',
        actor,
      };
      if (item.id)
        await this.updateOne(
          context,
          `UPDATE JSA_VERSION_BASIC_STEP SET VERSION_TASK_ID=:taskId,STEP_NUMBER=:number,STEP_TEXT=:text,DISPLAY_ORDER=:displayOrder,NO_TOOL_REQUIRED_FLAG=:noTool,IS_ACTIVE='Y',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE BASIC_STEP_ID=:id AND JSA_VERSION_ID=:versionId AND ROW_VERSION=:rowVersion`,
          binds,
        );
      else
        await context.connection.execute(
          `INSERT INTO JSA_VERSION_BASIC_STEP(BASIC_STEP_ID,JSA_VERSION_ID,LOGICAL_KEY,VERSION_TASK_ID,STEP_NUMBER,STEP_TEXT,DISPLAY_ORDER,NO_TOOL_REQUIRED_FLAG,CREATED_BY,UPDATED_BY) VALUES(:id,:versionId,:id,:taskId,:number,:text,:displayOrder,:noTool,:actor,:actor)`,
          binds,
        );
      await this.savePositions(context, access.versionId, id, item.performers, 'performer', actor);
      await this.savePositions(
        context,
        access.versionId,
        id,
        item.supervisors,
        'supervisor',
        actor,
      );
      await this.saveTools(context, access.versionId, id, item.tools, actor);
    }

    for (const item of input.coverage) {
      const id = item.id ?? (await this.next(context, 'SEQ_JSA_VER_PROMPT_COV'));
      const promptId = promptIds.get(item.promptRef),
        hazardId = hazardIds.get(item.hazardRef),
        controlId = item.controlRef ? controlIds.get(item.controlRef) : undefined;
      if (!promptId || !hazardId || (item.controlRef && !controlId))
        throw new ValidationError('Prompt coverage reference is invalid');
      const binds = {
        id,
        versionId: access.versionId,
        rowVersion: item.rowVersion,
        promptId,
        hazardId,
        controlId: controlId ?? null,
        note: item.note ?? null,
        actor,
      };
      if (item.id)
        await this.updateOne(
          context,
          `UPDATE JSA_VERSION_PROMPT_COVERAGE SET VERSION_PROMPT_ID=:promptId,VERSION_HAZARD_ID=:hazardId,VERSION_CONTROL_ID=:controlId,COVERAGE_NOTE=:note,IS_ACTIVE='Y',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE PROMPT_COVERAGE_ID=:id AND JSA_VERSION_ID=:versionId AND ROW_VERSION=:rowVersion`,
          binds,
        );
      else
        await context.connection.execute(
          `INSERT INTO JSA_VERSION_PROMPT_COVERAGE(PROMPT_COVERAGE_ID,JSA_VERSION_ID,LOGICAL_KEY,VERSION_PROMPT_ID,VERSION_HAZARD_ID,VERSION_CONTROL_ID,COVERAGE_NOTE,CREATED_BY,UPDATED_BY) VALUES(:id,:versionId,:id,:promptId,:hazardId,:controlId,:note,:actor,:actor)`,
          binds,
        );
    }
    for (const item of input.procedureReferences)
      await this.saveProcedure(context, access.versionId, item, actor);
    for (const item of input.attachments) {
      const id = item.id ?? (await this.next(context, 'SEQ_JSA_VER_ATTACHMENT'));
      const binds = {
        id,
        versionId: access.versionId,
        rowVersion: item.rowVersion,
        fileName: item.fileName,
        contentType: item.contentType ?? null,
        fileSize: item.fileSize ?? null,
        description: item.description ?? null,
        actor,
      };
      if (item.id)
        await this.updateOne(
          context,
          `UPDATE JSA_VERSION_ATTACHMENT SET FILE_NAME=:fileName,CONTENT_TYPE=:contentType,FILE_SIZE=:fileSize,DESCRIPTION=:description,IS_ACTIVE='Y',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE VERSION_ATTACHMENT_ID=:id AND JSA_VERSION_ID=:versionId AND ROW_VERSION=:rowVersion`,
          binds,
        );
      else
        await context.connection.execute(
          `INSERT INTO JSA_VERSION_ATTACHMENT(VERSION_ATTACHMENT_ID,JSA_VERSION_ID,LOGICAL_KEY,FILE_NAME,CONTENT_TYPE,FILE_SIZE,DESCRIPTION,CREATED_BY,UPDATED_BY) VALUES(:id,:versionId,:id,:fileName,:contentType,:fileSize,:description,:actor,:actor)`,
          binds,
        );
    }
  }

  async cancel(
    context: OracleTransactionContext,
    access: DraftAccessRecord,
    rowVersion: string,
    versionRowVersion: string,
    actor: string,
  ): Promise<void> {
    const v = await context.connection.execute(
      `UPDATE JSA_VERSION SET VERSION_STATUS='CANCELLED',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE JSA_VERSION_ID=:id AND ROW_VERSION=:rowVersion AND VERSION_STATUS IN ('DRAFT','RETURNED')`,
      { actor, id: access.versionId, rowVersion: versionRowVersion },
    );
    if (v.rowsAffected !== 1) throw new OptimisticLockError();
    const m = await context.connection.execute(
      `UPDATE JSA_MASTER SET LIFECYCLE_STATUS='CANCELLED',WORKING_VERSION_ID=NULL,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE JSA_ID=:id AND ROW_VERSION=:rowVersion AND CURRENT_VERSION_ID IS NULL AND LIFECYCLE_STATUS='DRAFT'`,
      { actor, id: access.jsaId, rowVersion },
    );
    if (m.rowsAffected !== 1) throw new OptimisticLockError();
  }

  async load(
    context: OracleTransactionContext,
    jsaId: string,
  ): Promise<DraftLoadRecord | undefined> {
    assertOracleId(jsaId, 'jsaId');
    const h = await context.connection.execute<Row>(
      `SELECT TO_CHAR(M.JSA_ID) JSA_ID,TO_CHAR(V.JSA_VERSION_ID) VERSION_ID,M.JSA_NUMBER,M.LIFECYCLE_STATUS,V.VERSION_STATUS,TO_CHAR(M.OWNER_SITE_ID) OWNER_SITE_ID,TO_CHAR(M.RIG_ID) RIG_ID,TO_CHAR(M.DEPARTMENT_ID) DEPARTMENT_ID,TO_CHAR(V.JOB_TYPE_ID) JOB_TYPE_ID,TO_CHAR(V.MATRIX_VERSION_ID) MATRIX_VERSION_ID,TO_CHAR(V.LANGUAGE_ID) LANGUAGE_ID,V.JOB_TITLE,V.JOB_DESCRIPTION,V.LOCATION_TEXT,V.PERSONNEL_TEXT,V.PTW_REQUIRED_FLAG,V.PTW_REFERENCE,TO_CHAR(M.CREATOR_USER_ID) CREATOR_USER_ID,TO_CHAR(M.ROW_VERSION) ROW_VERSION,TO_CHAR(V.ROW_VERSION) VERSION_ROW_VERSION FROM JSA_MASTER M JOIN JSA_VERSION V ON V.JSA_VERSION_ID=NVL(M.WORKING_VERSION_ID,M.CURRENT_VERSION_ID) WHERE M.JSA_ID=:jsaId`,
      { jsaId },
      options,
    );
    const r = h.rows?.[0];
    if (!r) return undefined;
    const versionId = r.VERSION_ID as string;
    const [pr, tr, hr, cr, cov, sr, perf, sup, tool, proc, att] = await Promise.all([
      context.connection.execute<Row>(
        `SELECT TO_CHAR(VERSION_PROMPT_ID) ID,TO_CHAR(LOGICAL_KEY) LOGICAL_KEY,TO_CHAR(PROMPT_ID) PROMPT_ID,PROMPT_CODE_SNAPSHOT CODE,PROMPT_LABEL_SNAPSHOT LABEL,SELECTED_FLAG,RESPONSE_NOTE,TO_CHAR(ROW_VERSION) ROW_VERSION FROM JSA_VERSION_PROMPT WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y' ORDER BY PROMPT_CODE_SNAPSHOT`,
        { versionId },
        options,
      ),
      context.connection.execute<Row>(
        `SELECT TO_CHAR(VERSION_TASK_ID) ID,TO_CHAR(LOGICAL_KEY) LOGICAL_KEY,TO_CHAR(PARENT_TASK_ID) PARENT_ID,TASK_NUMBER,TASK_TITLE,TASK_DESCRIPTION,DISPLAY_ORDER,TO_CHAR(ROW_VERSION) ROW_VERSION FROM JSA_VERSION_TASK WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y' ORDER BY DISPLAY_ORDER`,
        { versionId },
        options,
      ),
      context.connection.execute<Row>(
        `SELECT TO_CHAR(VERSION_HAZARD_ID) ID,TO_CHAR(LOGICAL_KEY) LOGICAL_KEY,TO_CHAR(VERSION_TASK_ID) TASK_ID,HAZARD_TEXT,DISPLAY_ORDER,TO_CHAR(INITIAL_LIKELIHOOD_ID) IL,TO_CHAR(INITIAL_SEVERITY_ID) ISV,TO_CHAR(INITIAL_CELL_ID) IC,INITIAL_RATING_CODE IRC,INITIAL_RESULT_CODE IRSC,INITIAL_RESULT_NAME IRSN,INITIAL_PROHIBITED_FLAG IP,TO_CHAR(RESIDUAL_LIKELIHOOD_ID) RL,TO_CHAR(RESIDUAL_SEVERITY_ID) RSV,TO_CHAR(RESIDUAL_CELL_ID) RC,RESIDUAL_RATING_CODE RRC,RESIDUAL_RESULT_CODE RRSC,RESIDUAL_RESULT_NAME RRSN,RESIDUAL_PROHIBITED_FLAG RP,TO_CHAR(ROW_VERSION) ROW_VERSION FROM JSA_VERSION_HAZARD WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y' ORDER BY DISPLAY_ORDER`,
        { versionId },
        options,
      ),
      context.connection.execute<Row>(
        `SELECT TO_CHAR(VERSION_CONTROL_ID) ID,TO_CHAR(LOGICAL_KEY) LOGICAL_KEY,TO_CHAR(VERSION_HAZARD_ID) HAZARD_ID,CONTROL_TEXT,DISPLAY_ORDER,TO_CHAR(ROW_VERSION) ROW_VERSION FROM JSA_VERSION_CONTROL WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y' ORDER BY DISPLAY_ORDER`,
        { versionId },
        options,
      ),
      context.connection.execute<Row>(
        `SELECT TO_CHAR(PROMPT_COVERAGE_ID) ID,TO_CHAR(LOGICAL_KEY) LOGICAL_KEY,TO_CHAR(VERSION_PROMPT_ID) PROMPT_ID,TO_CHAR(VERSION_HAZARD_ID) HAZARD_ID,TO_CHAR(VERSION_CONTROL_ID) CONTROL_ID,COVERAGE_NOTE,TO_CHAR(ROW_VERSION) ROW_VERSION FROM JSA_VERSION_PROMPT_COVERAGE WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y'`,
        { versionId },
        options,
      ),
      context.connection.execute<Row>(
        `SELECT TO_CHAR(BASIC_STEP_ID) ID,TO_CHAR(LOGICAL_KEY) LOGICAL_KEY,TO_CHAR(VERSION_TASK_ID) TASK_ID,STEP_NUMBER,STEP_TEXT,DISPLAY_ORDER,NO_TOOL_REQUIRED_FLAG,TO_CHAR(ROW_VERSION) ROW_VERSION FROM JSA_VERSION_BASIC_STEP WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y' ORDER BY DISPLAY_ORDER`,
        { versionId },
        options,
      ),
      context.connection.execute<Row>(
        `SELECT TO_CHAR(STEP_PERFORMER_ID) ID,TO_CHAR(LOGICAL_KEY) LOGICAL_KEY,TO_CHAR(BASIC_STEP_ID) STEP_ID,TO_CHAR(POSITION_ID) SOURCE_ID,POSITION_CODE_SNAPSHOT CODE,POSITION_NAME_SNAPSHOT NAME,DISPLAY_ORDER,TO_CHAR(ROW_VERSION) ROW_VERSION FROM JSA_VER_BASIC_STEP_PERFORMER WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y' ORDER BY DISPLAY_ORDER`,
        { versionId },
        options,
      ),
      context.connection.execute<Row>(
        `SELECT TO_CHAR(STEP_SUPERVISOR_ID) ID,TO_CHAR(LOGICAL_KEY) LOGICAL_KEY,TO_CHAR(BASIC_STEP_ID) STEP_ID,TO_CHAR(POSITION_ID) SOURCE_ID,POSITION_CODE_SNAPSHOT CODE,POSITION_NAME_SNAPSHOT NAME,DISPLAY_ORDER,TO_CHAR(ROW_VERSION) ROW_VERSION FROM JSA_VER_BASIC_STEP_SUPERVISOR WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y' ORDER BY DISPLAY_ORDER`,
        { versionId },
        options,
      ),
      context.connection.execute<Row>(
        `SELECT TO_CHAR(STEP_TOOL_ID) ID,TO_CHAR(LOGICAL_KEY) LOGICAL_KEY,TO_CHAR(BASIC_STEP_ID) STEP_ID,TO_CHAR(TOOL_ID) SOURCE_ID,TOOL_CODE_SNAPSHOT CODE,TOOL_NAME_SNAPSHOT NAME,DISPLAY_ORDER,TO_CHAR(ROW_VERSION) ROW_VERSION FROM JSA_VER_BASIC_STEP_TOOL WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y' ORDER BY DISPLAY_ORDER`,
        { versionId },
        options,
      ),
      context.connection.execute<Row>(
        `SELECT TO_CHAR(VERSION_PROCEDURE_REF_ID) ID,TO_CHAR(LOGICAL_KEY) LOGICAL_KEY,TO_CHAR(PROCEDURE_REFERENCE_ID) SOURCE_ID,REFERENCE_CODE_SNAPSHOT CODE,REFERENCE_TITLE_SNAPSHOT TITLE,REVISION_SNAPSHOT REVISION,URI_SNAPSHOT URI,NOTES_TEXT,DISPLAY_ORDER,TO_CHAR(ROW_VERSION) ROW_VERSION FROM JSA_VERSION_PROCEDURE_REF WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y' ORDER BY DISPLAY_ORDER`,
        { versionId },
        options,
      ),
      context.connection.execute<Row>(
        `SELECT TO_CHAR(VERSION_ATTACHMENT_ID) ID,TO_CHAR(LOGICAL_KEY) LOGICAL_KEY,FILE_NAME,CONTENT_TYPE,TO_CHAR(FILE_SIZE) FILE_SIZE,STORAGE_KEY,ATTACHMENT_STATUS,DESCRIPTION,TO_CHAR(ROW_VERSION) ROW_VERSION FROM JSA_VERSION_ATTACHMENT WHERE JSA_VERSION_ID=:versionId AND IS_ACTIVE='Y'`,
        { versionId },
        options,
      ),
    ]);
    const controls = (cr.rows ?? []).map((x) => ({
      id: x.ID,
      logicalKey: x.LOGICAL_KEY,
      text: x.CONTROL_TEXT,
      displayOrder: x.DISPLAY_ORDER,
      rowVersion: x.ROW_VERSION,
      hazardId: x.HAZARD_ID,
    }));
    const hazards = (hr.rows ?? []).map((x) => ({
      id: x.ID,
      logicalKey: x.LOGICAL_KEY,
      text: x.HAZARD_TEXT,
      displayOrder: x.DISPLAY_ORDER,
      initialRisk: this.mapRisk(x, 'I'),
      residualRisk: this.mapRisk(x, 'R'),
      controls: controls
        .filter((c) => c.hazardId === x.ID)
        .map((c) => ({
          id: c.id,
          logicalKey: c.logicalKey,
          text: c.text,
          displayOrder: c.displayOrder,
          rowVersion: c.rowVersion,
        })),
      rowVersion: x.ROW_VERSION,
      taskId: x.TASK_ID,
    }));
    const tasks = (tr.rows ?? []).map((x) => ({
      id: x.ID,
      logicalKey: x.LOGICAL_KEY,
      ...(x.PARENT_ID ? { parentTaskId: x.PARENT_ID } : {}),
      ...(x.TASK_NUMBER ? { number: x.TASK_NUMBER } : {}),
      title: x.TASK_TITLE,
      ...(x.TASK_DESCRIPTION ? { description: String(x.TASK_DESCRIPTION) } : {}),
      displayOrder: x.DISPLAY_ORDER,
      hazards: hazards
        .filter((z) => z.taskId === x.ID)
        .map((z) => ({
          id: z.id,
          logicalKey: z.logicalKey,
          text: z.text,
          displayOrder: z.displayOrder,
          initialRisk: z.initialRisk,
          residualRisk: z.residualRisk,
          controls: z.controls,
          rowVersion: z.rowVersion,
        })),
      rowVersion: x.ROW_VERSION,
    }));
    const mapPos = (x: Row): JsaPositionSnapshot => ({
      id: x.ID,
      logicalKey: x.LOGICAL_KEY,
      positionId: x.SOURCE_ID,
      code: x.CODE,
      name: x.NAME,
      displayOrder: x.DISPLAY_ORDER,
      rowVersion: x.ROW_VERSION,
    });
    const mapTool = (x: Row): JsaToolSnapshot => ({
      id: x.ID,
      logicalKey: x.LOGICAL_KEY,
      toolId: x.SOURCE_ID,
      code: x.CODE,
      name: x.NAME,
      displayOrder: x.DISPLAY_ORDER,
      rowVersion: x.ROW_VERSION,
    });
    const steps = (sr.rows ?? []).map((x) => ({
      id: x.ID,
      logicalKey: x.LOGICAL_KEY,
      ...(x.TASK_ID ? { taskId: x.TASK_ID } : {}),
      ...(x.STEP_NUMBER ? { number: x.STEP_NUMBER } : {}),
      text: x.STEP_TEXT,
      displayOrder: x.DISPLAY_ORDER,
      noToolRequired: x.NO_TOOL_REQUIRED_FLAG === 'Y',
      performers: (perf.rows ?? []).filter((y) => y.STEP_ID === x.ID).map(mapPos),
      supervisors: (sup.rows ?? []).filter((y) => y.STEP_ID === x.ID).map(mapPos),
      tools: (tool.rows ?? []).filter((y) => y.STEP_ID === x.ID).map(mapTool),
      rowVersion: x.ROW_VERSION,
    }));
    const header: JsaDraftHeader = {
      jsaId: r.JSA_ID,
      versionId,
      jsaNumber: r.JSA_NUMBER,
      lifecycleStatus: r.LIFECYCLE_STATUS,
      versionStatus: r.VERSION_STATUS,
      ownerSiteId: r.OWNER_SITE_ID,
      rigId: r.RIG_ID,
      departmentId: r.DEPARTMENT_ID,
      jobTypeId: r.JOB_TYPE_ID,
      matrixVersionId: r.MATRIX_VERSION_ID,
      ...(r.LANGUAGE_ID ? { languageId: r.LANGUAGE_ID } : {}),
      ...(r.JOB_TITLE ? { jobTitle: r.JOB_TITLE } : {}),
      ...(r.JOB_DESCRIPTION ? { jobDescription: String(r.JOB_DESCRIPTION) } : {}),
      ...(r.LOCATION_TEXT ? { location: r.LOCATION_TEXT } : {}),
      ...(r.PERSONNEL_TEXT ? { personnel: r.PERSONNEL_TEXT } : {}),
      ptwRequired: r.PTW_REQUIRED_FLAG === 'Y',
      ...(r.PTW_REFERENCE ? { ptwReference: r.PTW_REFERENCE } : {}),
      creatorUserId: r.CREATOR_USER_ID,
      rowVersion: r.ROW_VERSION,
      versionRowVersion: r.VERSION_ROW_VERSION,
    };
    return {
      header,
      prompts: (pr.rows ?? []).map((x) => ({
        id: x.ID,
        logicalKey: x.LOGICAL_KEY,
        promptId: x.PROMPT_ID,
        code: x.CODE,
        label: x.LABEL,
        selected: x.SELECTED_FLAG === 'Y',
        ...(x.RESPONSE_NOTE ? { responseNote: x.RESPONSE_NOTE } : {}),
        rowVersion: x.ROW_VERSION,
      })),
      tasks,
      coverage: (cov.rows ?? []).map((x) => ({
        id: x.ID,
        logicalKey: x.LOGICAL_KEY,
        promptId: x.PROMPT_ID,
        hazardId: x.HAZARD_ID,
        ...(x.CONTROL_ID ? { controlId: x.CONTROL_ID } : {}),
        ...(x.COVERAGE_NOTE ? { note: x.COVERAGE_NOTE } : {}),
        rowVersion: x.ROW_VERSION,
      })),
      steps,
      procedures: (proc.rows ?? []).map((x) => ({
        id: x.ID,
        logicalKey: x.LOGICAL_KEY,
        ...(x.SOURCE_ID ? { procedureReferenceId: x.SOURCE_ID } : {}),
        code: x.CODE,
        title: x.TITLE,
        ...(x.REVISION ? { revision: x.REVISION } : {}),
        ...(x.URI ? { uri: x.URI } : {}),
        ...(x.NOTES_TEXT ? { notes: x.NOTES_TEXT } : {}),
        displayOrder: x.DISPLAY_ORDER,
        rowVersion: x.ROW_VERSION,
      })),
      attachments: (att.rows ?? []).map((x) => ({
        id: x.ID,
        logicalKey: x.LOGICAL_KEY,
        fileName: x.FILE_NAME,
        ...(x.CONTENT_TYPE ? { contentType: x.CONTENT_TYPE } : {}),
        ...(x.FILE_SIZE ? { fileSize: x.FILE_SIZE } : {}),
        ...(x.STORAGE_KEY ? { storageKey: x.STORAGE_KEY } : {}),
        status: x.ATTACHMENT_STATUS,
        ...(x.DESCRIPTION ? { description: x.DESCRIPTION } : {}),
        rowVersion: x.ROW_VERSION,
      })),
    };
  }

  private async savePositions(
    context: OracleTransactionContext,
    versionId: string,
    stepId: string,
    items: PositionInput[],
    kind: 'performer' | 'supervisor',
    actor: string,
  ) {
    const table =
      kind === 'performer' ? 'JSA_VER_BASIC_STEP_PERFORMER' : 'JSA_VER_BASIC_STEP_SUPERVISOR';
    const pk = kind === 'performer' ? 'STEP_PERFORMER_ID' : 'STEP_SUPERVISOR_ID';
    const seq = kind === 'performer' ? 'SEQ_JSA_VER_STEP_PERF' : 'SEQ_JSA_VER_STEP_SUP';
    for (const item of items) {
      const id = item.id ?? (await this.next(context, seq));
      const src = await this.lookup(
        context,
        `SELECT POSITION_CODE CODE,POSITION_NAME NAME FROM SYS_POSITION WHERE POSITION_ID=:id AND IS_ACTIVE='Y'`,
        item.positionId,
        'Position',
      );
      const binds = {
        id,
        versionId,
        stepId,
        rowVersion: item.rowVersion,
        sourceId: item.positionId,
        code: src.CODE,
        name: src.NAME,
        displayOrder: item.displayOrder,
        actor,
      };
      if (item.id)
        await this.updateOne(
          context,
          `UPDATE ${table} SET BASIC_STEP_ID=:stepId,POSITION_ID=:sourceId,POSITION_CODE_SNAPSHOT=:code,POSITION_NAME_SNAPSHOT=:name,DISPLAY_ORDER=:displayOrder,IS_ACTIVE='Y',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE ${pk}=:id AND JSA_VERSION_ID=:versionId AND ROW_VERSION=:rowVersion`,
          binds,
        );
      else
        await context.connection.execute(
          `INSERT INTO ${table}(${pk},JSA_VERSION_ID,BASIC_STEP_ID,LOGICAL_KEY,POSITION_ID,POSITION_CODE_SNAPSHOT,POSITION_NAME_SNAPSHOT,DISPLAY_ORDER,CREATED_BY,UPDATED_BY) VALUES(:id,:versionId,:stepId,:id,:sourceId,:code,:name,:displayOrder,:actor,:actor)`,
          binds,
        );
    }
  }
  private async saveTools(
    context: OracleTransactionContext,
    versionId: string,
    stepId: string,
    items: ToolInput[],
    actor: string,
  ) {
    for (const item of items) {
      const id = item.id ?? (await this.next(context, 'SEQ_JSA_VER_STEP_TOOL'));
      const src = await this.lookup(
        context,
        `SELECT TOOL_CODE CODE,TOOL_NAME NAME FROM SYS_TOOL WHERE TOOL_ID=:id AND IS_ACTIVE='Y'`,
        item.toolId,
        'Tool',
      );
      const binds = {
        id,
        versionId,
        stepId,
        rowVersion: item.rowVersion,
        sourceId: item.toolId,
        code: src.CODE,
        name: src.NAME,
        displayOrder: item.displayOrder,
        actor,
      };
      if (item.id)
        await this.updateOne(
          context,
          `UPDATE JSA_VER_BASIC_STEP_TOOL SET BASIC_STEP_ID=:stepId,TOOL_ID=:sourceId,TOOL_CODE_SNAPSHOT=:code,TOOL_NAME_SNAPSHOT=:name,DISPLAY_ORDER=:displayOrder,IS_ACTIVE='Y',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE STEP_TOOL_ID=:id AND JSA_VERSION_ID=:versionId AND ROW_VERSION=:rowVersion`,
          binds,
        );
      else
        await context.connection.execute(
          `INSERT INTO JSA_VER_BASIC_STEP_TOOL(STEP_TOOL_ID,JSA_VERSION_ID,BASIC_STEP_ID,LOGICAL_KEY,TOOL_ID,TOOL_CODE_SNAPSHOT,TOOL_NAME_SNAPSHOT,DISPLAY_ORDER,CREATED_BY,UPDATED_BY) VALUES(:id,:versionId,:stepId,:id,:sourceId,:code,:name,:displayOrder,:actor,:actor)`,
          binds,
        );
    }
  }
  private async saveProcedure(
    context: OracleTransactionContext,
    versionId: string,
    item: ProcedureInput,
    actor: string,
  ) {
    const id = item.id ?? (await this.next(context, 'SEQ_JSA_VER_PROC_REF'));
    let code = item.code,
      title = item.title,
      revision = item.revision,
      uri = item.uri;
    if (item.procedureReferenceId) {
      const src = await this.lookup(
        context,
        `SELECT REFERENCE_CODE CODE,TITLE NAME,DOCUMENT_VERSION REVISION,EXTERNAL_URL URI FROM SYS_PROCEDURE_REFERENCE WHERE PROCEDURE_REFERENCE_ID=:id AND IS_ACTIVE='Y'`,
        item.procedureReferenceId,
        'Procedure Reference',
      );
      code = src.CODE;
      title = src.NAME;
      revision = src.REVISION;
      uri = src.URI;
    }
    if (!code?.trim() || !title?.trim())
      throw new ValidationError('Procedure code and title are required');
    const binds = {
      id,
      versionId,
      rowVersion: item.rowVersion,
      sourceId: item.procedureReferenceId ?? null,
      code,
      title,
      revision: revision ?? null,
      uri: uri ?? null,
      notes: item.notes ?? null,
      displayOrder: item.displayOrder,
      actor,
    };
    if (item.id)
      await this.updateOne(
        context,
        `UPDATE JSA_VERSION_PROCEDURE_REF SET PROCEDURE_REFERENCE_ID=:sourceId,REFERENCE_CODE_SNAPSHOT=:code,REFERENCE_TITLE_SNAPSHOT=:title,REVISION_SNAPSHOT=:revision,URI_SNAPSHOT=:uri,NOTES_TEXT=:notes,DISPLAY_ORDER=:displayOrder,IS_ACTIVE='Y',UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE VERSION_PROCEDURE_REF_ID=:id AND JSA_VERSION_ID=:versionId AND ROW_VERSION=:rowVersion`,
        binds,
      );
    else
      await context.connection.execute(
        `INSERT INTO JSA_VERSION_PROCEDURE_REF(VERSION_PROCEDURE_REF_ID,JSA_VERSION_ID,LOGICAL_KEY,PROCEDURE_REFERENCE_ID,REFERENCE_CODE_SNAPSHOT,REFERENCE_TITLE_SNAPSHOT,REVISION_SNAPSHOT,URI_SNAPSHOT,NOTES_TEXT,DISPLAY_ORDER,CREATED_BY,UPDATED_BY) VALUES(:id,:versionId,:id,:sourceId,:code,:title,:revision,:uri,:notes,:displayOrder,:actor,:actor)`,
        binds,
      );
  }
  private riskBinds(prefix: string, risk?: RiskSnapshot) {
    return {
      [`${prefix}LikelihoodId`]: risk?.likelihoodId ?? null,
      [`${prefix}SeverityId`]: risk?.severityId ?? null,
      [`${prefix}CellId`]: risk?.cellId ?? null,
      [`${prefix}RatingCode`]: risk?.ratingCode ?? null,
      [`${prefix}ResultCode`]: risk?.resultCode ?? null,
      [`${prefix}ResultName`]: risk?.resultName ?? null,
      [`${prefix}Prohibited`]: risk ? (risk.prohibited ? 'Y' : 'N') : null,
    };
  }
  private mapRisk(row: Row, prefix: 'I' | 'R'): JsaRiskSelection {
    const l = row[`${prefix}L`];
    return l
      ? {
          likelihoodId: l,
          severityId: row[`${prefix}SV`],
          cellId: row[`${prefix}C`],
          ...(row[`${prefix}RC`] ? { ratingCode: row[`${prefix}RC`] } : {}),
          resultCode: row[`${prefix}RSC`],
          resultName: row[`${prefix}RSN`],
          prohibited: row[`${prefix}P`] === 'Y',
        }
      : {};
  }
  private async lookup(
    context: OracleTransactionContext,
    sql: string,
    id: string,
    label: string,
  ): Promise<Row> {
    assertOracleId(id);
    const result = await context.connection.execute<Row>(sql, { id }, options);
    const row = result.rows?.[0];
    if (!row) throw new ValidationError(`${label} is not active or does not exist`);
    return row;
  }
  private async updateOne(
    context: OracleTransactionContext,
    sql: string,
    binds: oracledb.BindParameters,
  ) {
    const result = await context.connection.execute(sql, binds);
    if (result.rowsAffected !== 1) throw new OptimisticLockError();
  }
  private async next(context: OracleTransactionContext, sequence: string): Promise<string> {
    const allowed = [
      'SEQ_JSA_MASTER',
      'SEQ_JSA_VERSION',
      'SEQ_JSA_VER_PROMPT',
      'SEQ_JSA_VER_PROMPT_COV',
      'SEQ_JSA_VER_TASK',
      'SEQ_JSA_VER_HAZARD',
      'SEQ_JSA_VER_CONTROL',
      'SEQ_JSA_VER_BASIC_STEP',
      'SEQ_JSA_VER_STEP_PERF',
      'SEQ_JSA_VER_STEP_SUP',
      'SEQ_JSA_VER_STEP_TOOL',
      'SEQ_JSA_VER_PROC_REF',
      'SEQ_JSA_VER_ATTACHMENT',
    ];
    if (!allowed.includes(sequence)) throw new Error('Sequence is not allowlisted');
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(${sequence}.NEXTVAL) ID FROM DUAL`,
      {},
      options,
    );
    return result.rows?.[0]?.ID;
  }
}
