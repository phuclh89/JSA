import { Injectable } from '@nestjs/common';
import type {
  RigMatrixAssignment,
  RiskAxisLevel,
  RiskMatrixCell,
  RiskMatrixSummary,
  RiskMatrixVersionDetail,
  RiskMatrixVersionOption,
  RiskResultDefinition,
} from '@jsams/shared-types';
import oracledb from 'oracledb';
import { assertOracleId } from '../../../common/oracle/oracle-id';
import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import { validateMatrixConfiguration } from '../domain/matrix-completeness';
import type { RiskMatrixRepository } from '../domain/risk-matrix.repository';
import type {
  AssignmentInput,
  AssignmentListResult,
  MatrixConfigurationInput,
  MatrixInput,
  MatrixListResult,
  RigLockRecord,
  VersionInput,
} from '../domain/risk-matrix.types';

const objectOptions = { outFormat: oracledb.OUT_FORMAT_OBJECT } as const;

interface MatrixRow {
  MATRIX_ID: string;
  MATRIX_CODE: string;
  MATRIX_NAME: string;
  DIMENSION_SIZE: 3 | 5;
  DESCRIPTION?: string;
  IS_ACTIVE: 'Y' | 'N';
  ROW_VERSION: string;
  VERSION_COUNT: number;
}
interface VersionRow {
  MATRIX_VERSION_ID: string;
  MATRIX_ID: string;
  MATRIX_CODE: string;
  MATRIX_NAME: string;
  DIMENSION_SIZE: 3 | 5;
  VERSION_CODE: string;
  DESCRIPTION?: string;
  EFFECTIVE_FROM?: Date;
  EFFECTIVE_TO?: Date;
  IS_ACTIVE: 'Y' | 'N';
  ROW_VERSION: string;
  ASSIGNMENT_COUNT: number;
}
interface AxisRow {
  ID_VALUE: string;
  CODE_VALUE: string;
  LABEL_VALUE: string;
  NUMERIC_VALUE: number | null;
  DISPLAY_ORDER: number;
  DEFINITION_VALUE: string;
  PEOPLE_DEFINITION?: string;
  ASSET_DEFINITION?: string;
  ENVIRONMENT_DEFINITION?: string;
  IS_ACTIVE: 'Y' | 'N';
  ROW_VERSION: string;
}
interface ResultRow {
  RISK_RESULT_ID: string;
  RESULT_CODE: string;
  RESULT_NAME: string;
  DESCRIPTION?: string;
  SEMANTIC_CATEGORY?: string;
  DISPLAY_ORDER: number;
  DISPLAY_COLOR?: string;
  GUIDANCE_TEXT?: string;
  PROHIBITED_FLAG: 'Y' | 'N';
  IS_ACTIVE: 'Y' | 'N';
  ROW_VERSION: string;
}
interface CellRow {
  MATRIX_CELL_ID: string;
  LIKELIHOOD_ID: string;
  SEVERITY_ID: string;
  RATING_CODE: string | null;
  RATING_VALUE: number | null;
  RISK_RESULT_ID: string;
  RESULT_CODE: string;
  RESULT_NAME: string;
  DISPLAY_COLOR?: string;
  GUIDANCE_TEXT?: string;
  IS_ACTIVE: 'Y' | 'N';
  ROW_VERSION: string;
}
interface AssignmentRow {
  ASSIGNMENT_ID: string;
  SITE_ID: string;
  RIG_ID: string;
  RIG_CODE: string;
  MATRIX_VERSION_ID: string;
  MATRIX_CODE: string;
  VERSION_CODE: string;
  DIMENSION_SIZE: 3 | 5;
  EFFECTIVE_FROM: Date;
  EFFECTIVE_TO?: Date;
  REASON_TEXT: string;
  IS_ACTIVE: 'Y' | 'N';
  ROW_VERSION: string;
}

@Injectable()
export class OracleRiskMatrixRepository implements RiskMatrixRepository {
  async listVersionOptions(
    context: OracleTransactionContext,
    matrixId?: string,
  ): Promise<RiskMatrixVersionOption[]> {
    if (matrixId) assertOracleId(matrixId, 'matrixId');
    const result = await context.connection.execute<{
      MATRIX_VERSION_ID: string;
      MATRIX_ID: string;
      MATRIX_CODE: string;
      VERSION_CODE: string;
      DIMENSION_SIZE: 3 | 5;
      IS_ACTIVE: 'Y' | 'N';
    }>(
      `SELECT TO_CHAR(V.MATRIX_VERSION_ID) MATRIX_VERSION_ID,TO_CHAR(V.MATRIX_ID) MATRIX_ID,M.MATRIX_CODE,V.VERSION_CODE,M.DIMENSION_SIZE,V.IS_ACTIVE FROM JSA_RISK_MATRIX_VERSION V JOIN JSA_RISK_MATRIX M ON M.MATRIX_ID=V.MATRIX_ID WHERE (:matrixId IS NULL OR V.MATRIX_ID=:matrixId) ORDER BY M.MATRIX_CODE,V.VERSION_CODE`,
      { matrixId: matrixId ?? null },
      objectOptions,
    );
    const items: RiskMatrixVersionOption[] = [];
    for (const row of result.rows ?? []) {
      const detail = await this.loadVersion(context, row.MATRIX_VERSION_ID);
      if (detail)
        items.push({
          id: row.MATRIX_VERSION_ID,
          matrixId: row.MATRIX_ID,
          matrixCode: row.MATRIX_CODE,
          versionCode: row.VERSION_CODE,
          dimension: row.DIMENSION_SIZE,
          complete: detail.completeness.complete,
          active: row.IS_ACTIVE === 'Y',
          immutable: detail.immutable,
        });
    }
    return items;
  }
  async listMatrices(
    { connection }: OracleTransactionContext,
    keyword?: string,
    active?: boolean,
  ): Promise<MatrixListResult> {
    const where = ['1=1'];
    const binds: oracledb.BindParameters = {};
    if (keyword) {
      where.push('(UPPER(M.MATRIX_CODE) LIKE :keyword OR UPPER(M.MATRIX_NAME) LIKE :keyword)');
      binds.keyword = `%${keyword.toUpperCase()}%`;
    }
    if (active !== undefined) {
      where.push('M.IS_ACTIVE=:active');
      binds.active = active ? 'Y' : 'N';
    }
    const result = await connection.execute<MatrixRow>(
      `${this.matrixSelect()} WHERE ${where.join(' AND ')} ORDER BY M.MATRIX_NAME`,
      binds,
      objectOptions,
    );
    const items = (result.rows ?? []).map((row) => this.mapMatrix(row));
    return { items, total: items.length };
  }

  async findMatrix(
    { connection }: OracleTransactionContext,
    id: string,
  ): Promise<RiskMatrixSummary | undefined> {
    assertOracleId(id);
    const result = await connection.execute<MatrixRow>(
      `${this.matrixSelect()} WHERE M.MATRIX_ID=:id`,
      { id },
      objectOptions,
    );
    return result.rows?.[0] ? this.mapMatrix(result.rows[0]) : undefined;
  }

  async createMatrix(
    context: OracleTransactionContext,
    input: MatrixInput,
    actor: string,
  ): Promise<RiskMatrixSummary> {
    await context.connection.execute(
      `INSERT INTO JSA_RISK_MATRIX (MATRIX_ID,MATRIX_CODE,MATRIX_NAME,DIMENSION_SIZE,DESCRIPTION,CREATED_BY,UPDATED_BY) VALUES (SEQ_JSA_RISK_MATRIX.NEXTVAL,:code,:name,:dimension,:description,:actor,:actor)`,
      {
        code: input.code,
        name: input.name,
        dimension: input.dimension,
        description: input.description ?? null,
        actor,
      },
    );
    const id = await this.currentId(context, 'SEQ_JSA_RISK_MATRIX');
    return (await this.findMatrix(context, id))!;
  }

  async updateMatrix(
    context: OracleTransactionContext,
    id: string,
    input: MatrixInput,
    actor: string,
  ): Promise<RiskMatrixSummary | undefined> {
    assertOracleId(id);
    assertOracleId(input.rowVersion ?? '', 'rowVersion');
    const result = await context.connection.execute(
      `UPDATE JSA_RISK_MATRIX SET MATRIX_CODE=:code,MATRIX_NAME=:name,DIMENSION_SIZE=:dimension,DESCRIPTION=:description,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE MATRIX_ID=:id AND ROW_VERSION=:rowVersion`,
      {
        code: input.code,
        name: input.name,
        dimension: input.dimension,
        description: input.description ?? null,
        actor,
        id,
        rowVersion: input.rowVersion,
      },
    );
    return (result.rowsAffected ?? 0) === 1 ? this.findMatrix(context, id) : undefined;
  }

  async setMatrixActive(
    context: OracleTransactionContext,
    id: string,
    active: boolean,
    rowVersion: string,
    actor: string,
  ): Promise<RiskMatrixSummary | undefined> {
    assertOracleId(id);
    assertOracleId(rowVersion, 'rowVersion');
    const result = await context.connection.execute(
      `UPDATE JSA_RISK_MATRIX SET IS_ACTIVE=:active,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE MATRIX_ID=:id AND ROW_VERSION=:rowVersion`,
      { active: active ? 'Y' : 'N', actor, id, rowVersion },
    );
    return (result.rowsAffected ?? 0) === 1 ? this.findMatrix(context, id) : undefined;
  }

  async createVersion(
    context: OracleTransactionContext,
    matrixId: string,
    input: VersionInput,
    actor: string,
  ): Promise<RiskMatrixVersionDetail> {
    assertOracleId(matrixId, 'matrixId');
    await context.connection.execute(
      `INSERT INTO JSA_RISK_MATRIX_VERSION (MATRIX_VERSION_ID,MATRIX_ID,VERSION_CODE,DESCRIPTION,EFFECTIVE_FROM,EFFECTIVE_TO,CREATED_BY,UPDATED_BY) VALUES (SEQ_JSA_RISK_MATRIX_VER.NEXTVAL,:matrixId,:versionCode,:description,:effectiveFrom,:effectiveTo,:actor,:actor)`,
      {
        matrixId,
        versionCode: input.versionCode,
        description: input.description ?? null,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        actor,
      },
    );
    const id = await this.currentId(context, 'SEQ_JSA_RISK_MATRIX_VER');
    return (await this.loadVersion(context, id))!;
  }

  async updateVersion(
    context: OracleTransactionContext,
    id: string,
    input: VersionInput,
    actor: string,
  ): Promise<boolean> {
    assertOracleId(id);
    assertOracleId(input.rowVersion ?? '', 'rowVersion');
    const result = await context.connection.execute(
      `UPDATE JSA_RISK_MATRIX_VERSION SET VERSION_CODE=:versionCode,DESCRIPTION=:description,EFFECTIVE_FROM=:effectiveFrom,EFFECTIVE_TO=:effectiveTo,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE MATRIX_VERSION_ID=:id AND ROW_VERSION=:rowVersion AND NOT EXISTS (SELECT 1 FROM JSA_RIG_MATRIX_ASSIGNMENT A WHERE A.MATRIX_VERSION_ID=:id)`,
      {
        versionCode: input.versionCode,
        description: input.description ?? null,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        actor,
        id,
        rowVersion: input.rowVersion,
      },
    );
    return (result.rowsAffected ?? 0) === 1;
  }

  async loadVersion(
    { connection }: OracleTransactionContext,
    id: string,
  ): Promise<RiskMatrixVersionDetail | undefined> {
    assertOracleId(id, 'matrixVersionId');
    const versionResult = await connection.execute<VersionRow>(
      `SELECT TO_CHAR(V.MATRIX_VERSION_ID) MATRIX_VERSION_ID,TO_CHAR(V.MATRIX_ID) MATRIX_ID,M.MATRIX_CODE,M.MATRIX_NAME,M.DIMENSION_SIZE,V.VERSION_CODE,V.DESCRIPTION,V.EFFECTIVE_FROM,V.EFFECTIVE_TO,V.IS_ACTIVE,TO_CHAR(V.ROW_VERSION) ROW_VERSION,(SELECT COUNT(*) FROM JSA_RIG_MATRIX_ASSIGNMENT A WHERE A.MATRIX_VERSION_ID=V.MATRIX_VERSION_ID) ASSIGNMENT_COUNT FROM JSA_RISK_MATRIX_VERSION V JOIN JSA_RISK_MATRIX M ON M.MATRIX_ID=V.MATRIX_ID WHERE V.MATRIX_VERSION_ID=:id`,
      { id },
      objectOptions,
    );
    const version = versionResult.rows?.[0];
    if (!version) return undefined;
    const likelihoodRows = await connection.execute<AxisRow>(
      `SELECT TO_CHAR(LIKELIHOOD_ID) ID_VALUE,LIKELIHOOD_CODE CODE_VALUE,LIKELIHOOD_LABEL LABEL_VALUE,NUMERIC_VALUE,DISPLAY_ORDER,DEFINITION DEFINITION_VALUE,IS_ACTIVE,TO_CHAR(ROW_VERSION) ROW_VERSION FROM JSA_RISK_LIKELIHOOD WHERE MATRIX_VERSION_ID=:id ORDER BY DISPLAY_ORDER`,
      { id },
      objectOptions,
    );
    const severityRows = await connection.execute<AxisRow>(
      `SELECT TO_CHAR(SEVERITY_ID) ID_VALUE,SEVERITY_CODE CODE_VALUE,SEVERITY_LABEL LABEL_VALUE,NUMERIC_VALUE,DISPLAY_ORDER,GENERAL_DEFINITION DEFINITION_VALUE,PEOPLE_DEFINITION,ASSET_DEFINITION,ENVIRONMENT_DEFINITION,IS_ACTIVE,TO_CHAR(ROW_VERSION) ROW_VERSION FROM JSA_RISK_SEVERITY WHERE MATRIX_VERSION_ID=:id ORDER BY DISPLAY_ORDER`,
      { id },
      objectOptions,
    );
    const resultRows = await connection.execute<ResultRow>(
      `SELECT TO_CHAR(RISK_RESULT_ID) RISK_RESULT_ID,RESULT_CODE,RESULT_NAME,DESCRIPTION,SEMANTIC_CATEGORY,DISPLAY_ORDER,DISPLAY_COLOR,GUIDANCE_TEXT,PROHIBITED_FLAG,IS_ACTIVE,TO_CHAR(ROW_VERSION) ROW_VERSION FROM JSA_RISK_RESULT WHERE MATRIX_VERSION_ID=:id ORDER BY DISPLAY_ORDER`,
      { id },
      objectOptions,
    );
    const cellRows = await connection.execute<CellRow>(
      `SELECT TO_CHAR(C.MATRIX_CELL_ID) MATRIX_CELL_ID,TO_CHAR(C.LIKELIHOOD_ID) LIKELIHOOD_ID,TO_CHAR(C.SEVERITY_ID) SEVERITY_ID,C.RATING_CODE,C.RATING_VALUE,TO_CHAR(C.RISK_RESULT_ID) RISK_RESULT_ID,R.RESULT_CODE,R.RESULT_NAME,NVL(C.DISPLAY_COLOR,R.DISPLAY_COLOR) DISPLAY_COLOR,NVL(C.GUIDANCE_TEXT,R.GUIDANCE_TEXT) GUIDANCE_TEXT,C.IS_ACTIVE,TO_CHAR(C.ROW_VERSION) ROW_VERSION FROM JSA_RISK_MATRIX_CELL C JOIN JSA_RISK_RESULT R ON R.RISK_RESULT_ID=C.RISK_RESULT_ID AND R.MATRIX_VERSION_ID=C.MATRIX_VERSION_ID WHERE C.MATRIX_VERSION_ID=:id`,
      { id },
      objectOptions,
    );
    const likelihoods = (likelihoodRows.rows ?? []).map((row) => this.mapAxis(row));
    const severities = (severityRows.rows ?? []).map((row) => this.mapAxis(row, true));
    const results = (resultRows.rows ?? []).map((row) => this.mapResult(row));
    const cells = (cellRows.rows ?? []).map((row) => this.mapCell(row));
    const completeness = validateMatrixConfiguration(
      version.DIMENSION_SIZE,
      likelihoods.map((item) => ({
        ref: item.id,
        code: item.code,
        label: item.label,
        numericValue: item.numericValue,
        displayOrder: item.displayOrder,
        definition: item.definition,
        active: item.active,
      })),
      severities.map((item) => ({
        ref: item.id,
        code: item.code,
        label: item.label,
        numericValue: item.numericValue,
        displayOrder: item.displayOrder,
        definition: item.definition,
        peopleDefinition: item.peopleDefinition,
        assetDefinition: item.assetDefinition,
        environmentDefinition: item.environmentDefinition,
        active: item.active,
      })),
      results.map((item) => ({
        ref: item.id,
        code: item.code,
        name: item.name,
        description: item.description,
        semanticCategory: item.semanticCategory,
        displayOrder: item.displayOrder,
        displayColor: item.displayColor,
        guidanceText: item.guidanceText,
        prohibited: item.prohibited,
        active: item.active,
      })),
      cells.map((item) => ({
        ref: item.id,
        likelihoodRef: item.likelihoodId,
        severityRef: item.severityId,
        riskResultRef: item.riskResultId,
        ratingCode: item.ratingCode,
        ratingValue: item.ratingValue,
        displayColor: item.displayColor,
        guidanceText: item.guidanceText,
        active: item.active,
      })),
    );
    return {
      id: version.MATRIX_VERSION_ID,
      matrixId: version.MATRIX_ID,
      matrixCode: version.MATRIX_CODE,
      matrixName: version.MATRIX_NAME,
      dimension: version.DIMENSION_SIZE,
      versionCode: version.VERSION_CODE,
      ...(version.DESCRIPTION ? { description: version.DESCRIPTION } : {}),
      ...(version.EFFECTIVE_FROM ? { effectiveFrom: version.EFFECTIVE_FROM.toISOString() } : {}),
      ...(version.EFFECTIVE_TO ? { effectiveTo: version.EFFECTIVE_TO.toISOString() } : {}),
      active: version.IS_ACTIVE === 'Y',
      immutable: version.ASSIGNMENT_COUNT > 0,
      rowVersion: version.ROW_VERSION,
      likelihoods,
      severities,
      results,
      cells,
      completeness,
    };
  }

  async replaceConfiguration(
    context: OracleTransactionContext,
    versionId: string,
    input: MatrixConfigurationInput,
    actor: string,
  ): Promise<boolean> {
    assertOracleId(versionId);
    assertOracleId(input.rowVersion, 'rowVersion');
    const update = await context.connection.execute(
      `UPDATE JSA_RISK_MATRIX_VERSION SET UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE MATRIX_VERSION_ID=:versionId AND ROW_VERSION=:rowVersion AND NOT EXISTS (SELECT 1 FROM JSA_RIG_MATRIX_ASSIGNMENT A WHERE A.MATRIX_VERSION_ID=:versionId)`,
      { actor, versionId, rowVersion: input.rowVersion },
    );
    if ((update.rowsAffected ?? 0) !== 1) return false;
    await context.connection.execute(
      'DELETE FROM JSA_RISK_MATRIX_CELL WHERE MATRIX_VERSION_ID=:versionId',
      { versionId },
    );
    await context.connection.execute(
      'DELETE FROM JSA_RISK_RESULT WHERE MATRIX_VERSION_ID=:versionId',
      { versionId },
    );
    await context.connection.execute(
      'DELETE FROM JSA_RISK_SEVERITY WHERE MATRIX_VERSION_ID=:versionId',
      { versionId },
    );
    await context.connection.execute(
      'DELETE FROM JSA_RISK_LIKELIHOOD WHERE MATRIX_VERSION_ID=:versionId',
      { versionId },
    );
    const likelihoodIds = new Map<string, string>();
    const severityIds = new Map<string, string>();
    const resultIds = new Map<string, string>();
    for (const item of input.likelihoods) {
      await context.connection.execute(
        `INSERT INTO JSA_RISK_LIKELIHOOD (LIKELIHOOD_ID,MATRIX_VERSION_ID,LIKELIHOOD_CODE,LIKELIHOOD_LABEL,NUMERIC_VALUE,DISPLAY_ORDER,DEFINITION,IS_ACTIVE,CREATED_BY,UPDATED_BY) VALUES (SEQ_JSA_RISK_LIKELIHOOD.NEXTVAL,:versionId,:code,:label,:numericValue,:displayOrder,:definition,:active,:actor,:actor)`,
        {
          versionId,
          code: item.code,
          label: item.label,
          numericValue: item.numericValue,
          displayOrder: item.displayOrder,
          definition: item.definition,
          active: item.active === false ? 'N' : 'Y',
          actor,
        },
      );
      likelihoodIds.set(item.ref, await this.currentId(context, 'SEQ_JSA_RISK_LIKELIHOOD'));
    }
    for (const item of input.severities) {
      await context.connection.execute(
        `INSERT INTO JSA_RISK_SEVERITY (SEVERITY_ID,MATRIX_VERSION_ID,SEVERITY_CODE,SEVERITY_LABEL,NUMERIC_VALUE,DISPLAY_ORDER,GENERAL_DEFINITION,PEOPLE_DEFINITION,ASSET_DEFINITION,ENVIRONMENT_DEFINITION,IS_ACTIVE,CREATED_BY,UPDATED_BY) VALUES (SEQ_JSA_RISK_SEVERITY.NEXTVAL,:versionId,:code,:label,:numericValue,:displayOrder,:definition,:peopleDefinition,:assetDefinition,:environmentDefinition,:active,:actor,:actor)`,
        {
          versionId,
          code: item.code,
          label: item.label,
          numericValue: item.numericValue,
          displayOrder: item.displayOrder,
          definition: item.definition,
          peopleDefinition: item.peopleDefinition ?? null,
          assetDefinition: item.assetDefinition ?? null,
          environmentDefinition: item.environmentDefinition ?? null,
          active: item.active === false ? 'N' : 'Y',
          actor,
        },
      );
      severityIds.set(item.ref, await this.currentId(context, 'SEQ_JSA_RISK_SEVERITY'));
    }
    for (const item of input.results) {
      await context.connection.execute(
        `INSERT INTO JSA_RISK_RESULT (RISK_RESULT_ID,MATRIX_VERSION_ID,RESULT_CODE,RESULT_NAME,DESCRIPTION,SEMANTIC_CATEGORY,DISPLAY_ORDER,DISPLAY_COLOR,GUIDANCE_TEXT,PROHIBITED_FLAG,IS_ACTIVE,CREATED_BY,UPDATED_BY) VALUES (SEQ_JSA_RISK_RESULT.NEXTVAL,:versionId,:code,:name,:description,:semanticCategory,:displayOrder,:displayColor,:guidanceText,:prohibited,:active,:actor,:actor)`,
        {
          versionId,
          code: item.code,
          name: item.name,
          description: item.description ?? null,
          semanticCategory: item.semanticCategory ?? null,
          displayOrder: item.displayOrder,
          displayColor: item.displayColor ?? null,
          guidanceText: item.guidanceText ?? null,
          prohibited: item.prohibited ? 'Y' : 'N',
          active: item.active === false ? 'N' : 'Y',
          actor,
        },
      );
      resultIds.set(item.ref, await this.currentId(context, 'SEQ_JSA_RISK_RESULT'));
    }
    for (const item of input.cells) {
      const likelihoodId = likelihoodIds.get(item.likelihoodRef);
      const severityId = severityIds.get(item.severityRef);
      const riskResultId = resultIds.get(item.riskResultRef);
      if (!likelihoodId || !severityId || !riskResultId)
        throw new Error('Validated Matrix reference mapping failed');
      await context.connection.execute(
        `INSERT INTO JSA_RISK_MATRIX_CELL (MATRIX_CELL_ID,MATRIX_VERSION_ID,LIKELIHOOD_ID,SEVERITY_ID,RATING_CODE,RATING_VALUE,RISK_RESULT_ID,DISPLAY_COLOR,GUIDANCE_TEXT,IS_ACTIVE,CREATED_BY,UPDATED_BY) VALUES (SEQ_JSA_RISK_MATRIX_CELL.NEXTVAL,:versionId,:likelihoodId,:severityId,:ratingCode,:ratingValue,:riskResultId,:displayColor,:guidanceText,:active,:actor,:actor)`,
        {
          versionId,
          likelihoodId,
          severityId,
          ratingCode: item.ratingCode,
          ratingValue: item.ratingValue,
          riskResultId,
          displayColor: item.displayColor ?? null,
          guidanceText: item.guidanceText ?? null,
          active: item.active === false ? 'N' : 'Y',
          actor,
        },
      );
    }
    return true;
  }

  async lockVersion(
    { connection }: OracleTransactionContext,
    id: string,
  ): Promise<{ rowVersion: string; immutable: boolean } | undefined> {
    assertOracleId(id);
    const result = await connection.execute<{ ROW_VERSION: string; ASSIGNMENT_COUNT: number }>(
      `SELECT TO_CHAR(V.ROW_VERSION) ROW_VERSION,(SELECT COUNT(*) FROM JSA_RIG_MATRIX_ASSIGNMENT A WHERE A.MATRIX_VERSION_ID=V.MATRIX_VERSION_ID) ASSIGNMENT_COUNT FROM JSA_RISK_MATRIX_VERSION V WHERE V.MATRIX_VERSION_ID=:id FOR UPDATE`,
      { id },
      objectOptions,
    );
    const row = result.rows?.[0];
    return row ? { rowVersion: row.ROW_VERSION, immutable: row.ASSIGNMENT_COUNT > 0 } : undefined;
  }
  async lockRig(
    { connection }: OracleTransactionContext,
    rigId: string,
  ): Promise<RigLockRecord | undefined> {
    assertOracleId(rigId);
    const result = await connection.execute<{
      RIG_ID: string;
      SITE_ID: string;
      IS_ACTIVE: 'Y' | 'N';
    }>(
      'SELECT TO_CHAR(RIG_ID) RIG_ID,TO_CHAR(SITE_ID) SITE_ID,IS_ACTIVE FROM SYS_RIG WHERE RIG_ID=:rigId FOR UPDATE',
      { rigId },
      objectOptions,
    );
    const row = result.rows?.[0];
    return row
      ? { rigId: row.RIG_ID, siteId: row.SITE_ID, active: row.IS_ACTIVE === 'Y' }
      : undefined;
  }

  async hasOverlap(
    { connection }: OracleTransactionContext,
    input: AssignmentInput,
    excludeId?: string,
  ): Promise<RigMatrixAssignment | undefined> {
    assertOracleId(input.rigId);
    const result = await connection.execute<AssignmentRow>(
      `${this.assignmentSelect()} WHERE A.RIG_ID=:rigId AND A.IS_ACTIVE='Y' AND (:excludeId IS NULL OR A.RIG_MATRIX_ASSIGNMENT_ID<>:excludeId) AND A.EFFECTIVE_FROM < NVL(:effectiveTo, TIMESTAMP '9999-12-31 23:59:59') AND NVL(A.EFFECTIVE_TO,TIMESTAMP '9999-12-31 23:59:59') > :effectiveFrom FETCH FIRST 1 ROW ONLY`,
      {
        rigId: input.rigId,
        excludeId: excludeId ?? null,
        effectiveFrom: new Date(input.effectiveFrom),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      },
      objectOptions,
    );
    return result.rows?.[0] ? this.mapAssignment(result.rows[0]) : undefined;
  }
  async listAssignments(
    { connection }: OracleTransactionContext,
    rigId?: string,
  ): Promise<AssignmentListResult> {
    if (rigId) assertOracleId(rigId);
    const result = await connection.execute<AssignmentRow>(
      `${this.assignmentSelect()} WHERE (:rigId IS NULL OR A.RIG_ID=:rigId) ORDER BY A.EFFECTIVE_FROM DESC`,
      { rigId: rigId ?? null },
      objectOptions,
    );
    const items = (result.rows ?? []).map((row) => this.mapAssignment(row));
    return { items, total: items.length };
  }
  async findAssignment(
    { connection }: OracleTransactionContext,
    id: string,
  ): Promise<RigMatrixAssignment | undefined> {
    assertOracleId(id);
    const result = await connection.execute<AssignmentRow>(
      `${this.assignmentSelect()} WHERE A.RIG_MATRIX_ASSIGNMENT_ID=:id`,
      { id },
      objectOptions,
    );
    return result.rows?.[0] ? this.mapAssignment(result.rows[0]) : undefined;
  }
  async createAssignment(
    context: OracleTransactionContext,
    input: AssignmentInput,
    actor: string,
  ): Promise<RigMatrixAssignment> {
    await context.connection.execute(
      `INSERT INTO JSA_RIG_MATRIX_ASSIGNMENT (RIG_MATRIX_ASSIGNMENT_ID,RIG_ID,MATRIX_VERSION_ID,EFFECTIVE_FROM,EFFECTIVE_TO,REASON_TEXT,CREATED_BY,UPDATED_BY) VALUES (SEQ_JSA_RIG_MATRIX_ASSIGN.NEXTVAL,:rigId,:matrixVersionId,:effectiveFrom,:effectiveTo,:reason,:actor,:actor)`,
      {
        rigId: input.rigId,
        matrixVersionId: input.matrixVersionId,
        effectiveFrom: new Date(input.effectiveFrom),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        reason: input.reason,
        actor,
      },
    );
    return (await this.findAssignment(
      context,
      await this.currentId(context, 'SEQ_JSA_RIG_MATRIX_ASSIGN'),
    ))!;
  }
  async updateAssignment(
    context: OracleTransactionContext,
    id: string,
    input: AssignmentInput,
    actor: string,
  ): Promise<RigMatrixAssignment | undefined> {
    assertOracleId(id);
    assertOracleId(input.rowVersion ?? '', 'rowVersion');
    const result = await context.connection.execute(
      `UPDATE JSA_RIG_MATRIX_ASSIGNMENT SET RIG_ID=:rigId,MATRIX_VERSION_ID=:matrixVersionId,EFFECTIVE_FROM=:effectiveFrom,EFFECTIVE_TO=:effectiveTo,REASON_TEXT=:reason,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE RIG_MATRIX_ASSIGNMENT_ID=:id AND ROW_VERSION=:rowVersion AND EFFECTIVE_FROM>SYSTIMESTAMP`,
      {
        rigId: input.rigId,
        matrixVersionId: input.matrixVersionId,
        effectiveFrom: new Date(input.effectiveFrom),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        reason: input.reason,
        actor,
        id,
        rowVersion: input.rowVersion,
      },
    );
    return (result.rowsAffected ?? 0) === 1 ? this.findAssignment(context, id) : undefined;
  }
  async endAssignment(
    context: OracleTransactionContext,
    id: string,
    effectiveTo: string,
    reason: string,
    rowVersion: string,
    actor: string,
  ): Promise<RigMatrixAssignment | undefined> {
    assertOracleId(id);
    assertOracleId(rowVersion, 'rowVersion');
    const result = await context.connection.execute(
      `UPDATE JSA_RIG_MATRIX_ASSIGNMENT SET EFFECTIVE_TO=:effectiveTo,REASON_TEXT=:reason,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1 WHERE RIG_MATRIX_ASSIGNMENT_ID=:id AND ROW_VERSION=:rowVersion AND EFFECTIVE_FROM<:effectiveTo`,
      { effectiveTo: new Date(effectiveTo), reason, actor, id, rowVersion },
    );
    return (result.rowsAffected ?? 0) === 1 ? this.findAssignment(context, id) : undefined;
  }
  async resolveEffective(
    { connection }: OracleTransactionContext,
    rigId: string,
    effectiveAt: string,
  ): Promise<RigMatrixAssignment[]> {
    assertOracleId(rigId);
    const result = await connection.execute<AssignmentRow>(
      `${this.assignmentSelect()} WHERE A.RIG_ID=:rigId AND A.IS_ACTIVE='Y' AND A.EFFECTIVE_FROM<=:effectiveAt AND (A.EFFECTIVE_TO IS NULL OR A.EFFECTIVE_TO>:effectiveAt)`,
      { rigId, effectiveAt: new Date(effectiveAt) },
      objectOptions,
    );
    return (result.rows ?? []).map((row) => this.mapAssignment(row));
  }

  private matrixSelect(): string {
    return `SELECT TO_CHAR(M.MATRIX_ID) MATRIX_ID,M.MATRIX_CODE,M.MATRIX_NAME,M.DIMENSION_SIZE,M.DESCRIPTION,M.IS_ACTIVE,TO_CHAR(M.ROW_VERSION) ROW_VERSION,(SELECT COUNT(*) FROM JSA_RISK_MATRIX_VERSION V WHERE V.MATRIX_ID=M.MATRIX_ID) VERSION_COUNT FROM JSA_RISK_MATRIX M`;
  }
  private assignmentSelect(): string {
    return `SELECT TO_CHAR(A.RIG_MATRIX_ASSIGNMENT_ID) ASSIGNMENT_ID,TO_CHAR(R.SITE_ID) SITE_ID,TO_CHAR(A.RIG_ID) RIG_ID,R.RIG_CODE,TO_CHAR(A.MATRIX_VERSION_ID) MATRIX_VERSION_ID,M.MATRIX_CODE,V.VERSION_CODE,M.DIMENSION_SIZE,A.EFFECTIVE_FROM,A.EFFECTIVE_TO,A.REASON_TEXT,A.IS_ACTIVE,TO_CHAR(A.ROW_VERSION) ROW_VERSION FROM JSA_RIG_MATRIX_ASSIGNMENT A JOIN SYS_RIG R ON R.RIG_ID=A.RIG_ID JOIN JSA_RISK_MATRIX_VERSION V ON V.MATRIX_VERSION_ID=A.MATRIX_VERSION_ID JOIN JSA_RISK_MATRIX M ON M.MATRIX_ID=V.MATRIX_ID`;
  }
  private mapMatrix(row: MatrixRow): RiskMatrixSummary {
    return {
      id: row.MATRIX_ID,
      code: row.MATRIX_CODE,
      name: row.MATRIX_NAME,
      dimension: row.DIMENSION_SIZE,
      ...(row.DESCRIPTION ? { description: row.DESCRIPTION } : {}),
      active: row.IS_ACTIVE === 'Y',
      rowVersion: row.ROW_VERSION,
      versionCount: row.VERSION_COUNT,
    };
  }
  private mapAxis(row: AxisRow, severity = false): RiskAxisLevel {
    return {
      id: row.ID_VALUE,
      code: row.CODE_VALUE,
      label: row.LABEL_VALUE,
      numericValue: row.NUMERIC_VALUE,
      displayOrder: row.DISPLAY_ORDER,
      definition: row.DEFINITION_VALUE,
      ...(severity && row.PEOPLE_DEFINITION ? { peopleDefinition: row.PEOPLE_DEFINITION } : {}),
      ...(severity && row.ASSET_DEFINITION ? { assetDefinition: row.ASSET_DEFINITION } : {}),
      ...(severity && row.ENVIRONMENT_DEFINITION
        ? { environmentDefinition: row.ENVIRONMENT_DEFINITION }
        : {}),
      active: row.IS_ACTIVE === 'Y',
      rowVersion: row.ROW_VERSION,
    };
  }
  private mapResult(row: ResultRow): RiskResultDefinition {
    return {
      id: row.RISK_RESULT_ID,
      code: row.RESULT_CODE,
      name: row.RESULT_NAME,
      ...(row.DESCRIPTION ? { description: row.DESCRIPTION } : {}),
      ...(row.SEMANTIC_CATEGORY ? { semanticCategory: row.SEMANTIC_CATEGORY } : {}),
      displayOrder: row.DISPLAY_ORDER,
      ...(row.DISPLAY_COLOR ? { displayColor: row.DISPLAY_COLOR } : {}),
      ...(row.GUIDANCE_TEXT ? { guidanceText: row.GUIDANCE_TEXT } : {}),
      prohibited: row.PROHIBITED_FLAG === 'Y',
      active: row.IS_ACTIVE === 'Y',
      rowVersion: row.ROW_VERSION,
    };
  }
  private mapCell(row: CellRow): RiskMatrixCell {
    return {
      id: row.MATRIX_CELL_ID,
      likelihoodId: row.LIKELIHOOD_ID,
      severityId: row.SEVERITY_ID,
      ratingCode: row.RATING_CODE,
      ratingValue: row.RATING_VALUE,
      riskResultId: row.RISK_RESULT_ID,
      riskResultCode: row.RESULT_CODE,
      riskResultName: row.RESULT_NAME,
      ...(row.DISPLAY_COLOR ? { displayColor: row.DISPLAY_COLOR } : {}),
      ...(row.GUIDANCE_TEXT ? { guidanceText: row.GUIDANCE_TEXT } : {}),
      active: row.IS_ACTIVE === 'Y',
      rowVersion: row.ROW_VERSION,
    };
  }
  private mapAssignment(row: AssignmentRow): RigMatrixAssignment {
    return {
      id: row.ASSIGNMENT_ID,
      siteId: row.SITE_ID,
      rigId: row.RIG_ID,
      rigCode: row.RIG_CODE,
      matrixVersionId: row.MATRIX_VERSION_ID,
      matrixCode: row.MATRIX_CODE,
      versionCode: row.VERSION_CODE,
      dimension: row.DIMENSION_SIZE,
      effectiveFrom: row.EFFECTIVE_FROM.toISOString(),
      ...(row.EFFECTIVE_TO ? { effectiveTo: row.EFFECTIVE_TO.toISOString() } : {}),
      reason: row.REASON_TEXT,
      active: row.IS_ACTIVE === 'Y',
      rowVersion: row.ROW_VERSION,
    };
  }
  private async currentId(
    { connection }: OracleTransactionContext,
    sequence: string,
  ): Promise<string> {
    const allowed = [
      'SEQ_JSA_RISK_MATRIX',
      'SEQ_JSA_RISK_MATRIX_VER',
      'SEQ_JSA_RISK_LIKELIHOOD',
      'SEQ_JSA_RISK_SEVERITY',
      'SEQ_JSA_RISK_RESULT',
      'SEQ_JSA_RIG_MATRIX_ASSIGN',
    ];
    if (!allowed.includes(sequence)) throw new Error('Sequence is not allowlisted');
    const result = await connection.execute<{ ID_VALUE: string }>(
      `SELECT TO_CHAR(${sequence}.CURRVAL) ID_VALUE FROM DUAL`,
      {},
      objectOptions,
    );
    return result.rows?.[0]?.ID_VALUE ?? '';
  }
}
