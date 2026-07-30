import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { pvDrillingSites } from './pv-drilling-site-rig-data.js';

const actor = process.env.SITE_RIG_SEED_ACTOR?.trim() || 'phuclh';

type IdRow = { ID_VALUE: string };
type SiteRow = { SITE_ID: string; SITE_CODE: string };
type RigRow = { RIG_ID: string; RIG_CODE: string };
type CountRow = { ITEM_COUNT: number };

async function nextId(connection: oracledb.Connection, sequence: string): Promise<string> {
  const result = await connection.execute<IdRow>(
    `SELECT TO_CHAR(${sequence}.NEXTVAL) ID_VALUE FROM DUAL`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const id = result.rows?.[0]?.ID_VALUE;
  if (!id) throw new Error(`Could not allocate an ID from ${sequence}`);
  return id;
}

async function count(connection: oracledb.Connection, sql: string): Promise<number> {
  const result = await connection.execute<CountRow>(
    sql,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return result.rows?.[0]?.ITEM_COUNT ?? 0;
}

async function findSite(
  connection: oracledb.Connection,
  code: string,
): Promise<SiteRow | undefined> {
  const result = await connection.execute<SiteRow>(
    `SELECT TO_CHAR(SITE_ID) SITE_ID,SITE_CODE
     FROM SYS_SITE WHERE UPPER(SITE_CODE)=:code FOR UPDATE`,
    { code },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return result.rows?.[0];
}

async function ensureSite(
  connection: oracledb.Connection,
  target: (typeof pvDrillingSites)[number],
  legacyCode?: string,
): Promise<{ id: string; converted: boolean; created: boolean }> {
  const existing = await findSite(connection, target.code);
  const legacy = legacyCode ? await findSite(connection, legacyCode) : undefined;
  if (existing && legacy && existing.SITE_ID !== legacy.SITE_ID)
    throw new Error(`Cannot merge existing Sites ${legacyCode} and ${target.code}`);

  const selected = existing ?? legacy;
  if (selected) {
    await connection.execute(
      `UPDATE SYS_SITE
       SET SITE_CODE=:code,SITE_NAME=:name,SEQUENCE_CODE=:sequenceCode,IS_ACTIVE='Y',
           UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
       WHERE SITE_ID=:siteId`,
      {
        code: target.code,
        name: target.name,
        sequenceCode: target.sequenceCode,
        actor,
        siteId: selected.SITE_ID,
      },
    );
    return {
      id: selected.SITE_ID,
      converted: selected.SITE_CODE.toUpperCase() !== target.code,
      created: false,
    };
  }

  const siteId = await nextId(connection, 'SEQ_SYS_SITE');
  await connection.execute(
    `INSERT INTO SYS_SITE
     (SITE_ID,SITE_CODE,SITE_NAME,SEQUENCE_CODE,TIMEZONE_NAME,CREATED_BY,UPDATED_BY)
     VALUES
     (:siteId,:code,:name,:sequenceCode,:timezone,:actor,:actor)`,
    {
      siteId,
      code: target.code,
      name: target.name,
      sequenceCode: target.sequenceCode,
      timezone: 'Asia/Ho_Chi_Minh',
      actor,
    },
  );
  return { id: siteId, converted: false, created: true };
}

async function findRig(
  connection: oracledb.Connection,
  siteId: string,
  code: string,
): Promise<RigRow | undefined> {
  const result = await connection.execute<RigRow>(
    `SELECT TO_CHAR(RIG_ID) RIG_ID,RIG_CODE
     FROM SYS_RIG WHERE SITE_ID=:siteId AND UPPER(RIG_CODE)=:code FOR UPDATE`,
    { siteId, code },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return result.rows?.[0];
}

async function ensureRig(
  connection: oracledb.Connection,
  siteId: string,
  target: { readonly code: string; readonly name: string },
  legacyCode?: string,
): Promise<{ id: string; converted: boolean; created: boolean }> {
  const existing = await findRig(connection, siteId, target.code);
  const legacy = legacyCode ? await findRig(connection, siteId, legacyCode) : undefined;
  if (existing && legacy && existing.RIG_ID !== legacy.RIG_ID)
    throw new Error(`Cannot merge existing Rigs ${legacyCode} and ${target.code}`);

  const selected = existing ?? legacy;
  if (selected) {
    await connection.execute(
      `UPDATE SYS_RIG
       SET RIG_CODE=:code,RIG_NAME=:name,IS_ACTIVE='Y',UPDATED_SITE_ID=:siteId,
           UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,ROW_VERSION=ROW_VERSION+1
       WHERE RIG_ID=:rigId AND SITE_ID=:siteId`,
      {
        code: target.code,
        name: target.name,
        actor,
        siteId,
        rigId: selected.RIG_ID,
      },
    );
    return {
      id: selected.RIG_ID,
      converted: selected.RIG_CODE.toUpperCase() !== target.code,
      created: false,
    };
  }

  const rigId = await nextId(connection, 'SEQ_SYS_RIG');
  await connection.execute(
    `INSERT INTO SYS_RIG
     (RIG_ID,SITE_ID,RIG_CODE,RIG_NAME,CREATED_SITE_ID,UPDATED_SITE_ID,CREATED_BY,UPDATED_BY)
     VALUES
     (:rigId,:siteId,:code,:name,:siteId,:siteId,:actor,:actor)`,
    {
      rigId,
      siteId,
      code: target.code,
      name: target.name,
      actor,
    },
  );
  return { id: rigId, converted: false, created: true };
}

async function main(): Promise<void> {
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const jsaCountBefore = await count(connection, 'SELECT COUNT(*) ITEM_COUNT FROM JSA_MASTER');
    const siteResults: Array<Record<string, unknown>> = [];
    const rigResults: Array<Record<string, unknown>> = [];

    for (const site of pvDrillingSites) {
      const siteResult = await ensureSite(
        connection,
        site,
        site.code === 'OFFSHORE' ? 'DEV' : undefined,
      );
      siteResults.push({
        code: site.code,
        id: siteResult.id,
        converted: siteResult.converted,
        created: siteResult.created,
      });

      for (const rig of site.rigs) {
        const rigResult = await ensureRig(
          connection,
          siteResult.id,
          rig,
          site.code === 'OFFSHORE' && rig.code === 'PVD-I' ? 'DEV-RIG' : undefined,
        );
        rigResults.push({
          siteCode: site.code,
          code: rig.code,
          id: rigResult.id,
          converted: rigResult.converted,
          created: rigResult.created,
        });
      }
    }

    const extraSites = await count(
      connection,
      `SELECT COUNT(*) ITEM_COUNT FROM SYS_SITE
       WHERE IS_ACTIVE='Y' AND UPPER(SITE_CODE) NOT IN ('OFFSHORE','ONSHORE')`,
    );
    const extraRigs = await count(
      connection,
      `SELECT COUNT(*) ITEM_COUNT
       FROM SYS_RIG R JOIN SYS_SITE S ON S.SITE_ID=R.SITE_ID
       WHERE R.IS_ACTIVE='Y' AND S.IS_ACTIVE='Y'
         AND (
           (S.SITE_CODE='OFFSHORE' AND R.RIG_CODE NOT IN
             ('PVD-I','PVD-II','PVD-III','PVD-V','PVD-VI','PVD-VIII','PVD-IX','PVD-X'))
           OR (S.SITE_CODE='ONSHORE' AND R.RIG_CODE<>'SHOREBASE')
         )`,
    );
    if (extraSites !== 0 || extraRigs !== 0)
      throw new Error(
        `Unexpected active organization data remains: extraSites=${extraSites}, extraRigs=${extraRigs}`,
      );

    const jsaCountAfter = await count(connection, 'SELECT COUNT(*) ITEM_COUNT FROM JSA_MASTER');
    if (jsaCountAfter !== jsaCountBefore)
      throw new Error('Site/Rig seed must not add or remove JSA records');

    await connection.commit();
    console.log(
      JSON.stringify({
        status: 'PASS',
        sites: siteResults,
        rigs: rigResults,
        preservedJsaCount: jsaCountAfter,
      }),
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      status: 'FAIL',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
