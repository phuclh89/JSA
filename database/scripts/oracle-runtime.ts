import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import oracledb from 'oracledb';

let initialized = false;

export function loadDatabaseEnvironment(): void {
  dotenv.config({ path: path.resolve(process.cwd(), '../.env'), override: false });
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: false });
}

export function initializeDatabaseOracleClient(): void {
  if (initialized) return;
  const mode = process.env.ORACLE_CLIENT_MODE ?? 'thin';
  if (mode !== 'thin' && mode !== 'thick')
    throw new Error('ORACLE_CLIENT_MODE must be thin or thick');
  if (mode === 'thick') {
    const configured = process.env.ORACLE_CLIENT_LIB_DIR;
    if (!configured)
      throw new Error('ORACLE_CLIENT_LIB_DIR is required when ORACLE_CLIENT_MODE=thick');
    const libDir = path.resolve(configured);
    if (!existsSync(libDir) || !existsSync(path.join(libDir, 'oci.dll')))
      throw new Error('Oracle Instant Client directory or oci.dll does not exist');
    try {
      oracledb.initOracleClient({ libDir });
    } catch (error) {
      const code = (error as { code?: string }).code;
      throw new Error(`${code ? `${code}: ` : ''}Oracle Thick client initialization failed`, {
        cause: error,
      });
    }
  }
  initialized = true;
}

export function prepareDatabaseOracleRuntime(): void {
  loadDatabaseEnvironment();
  initializeDatabaseOracleClient();
}
