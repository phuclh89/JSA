import { existsSync } from 'node:fs';
import path from 'node:path';
import oracledb from 'oracledb';

export type OracleClientMode = 'thin' | 'thick';
let initializedMode: OracleClientMode | undefined;

export interface OracleClientSettings {
  clientMode: OracleClientMode;
  clientLibDir?: string;
}

export function initializeOracleClient(
  settings: OracleClientSettings,
  log: (entry: Record<string, unknown>) => void = () => undefined,
): void {
  if (initializedMode) {
    if (initializedMode !== settings.clientMode)
      throw new Error(`Oracle client was already initialized in ${initializedMode} mode`);
    return;
  }
  if (settings.clientMode === 'thick') {
    if (!settings.clientLibDir)
      throw new Error('ORACLE_CLIENT_LIB_DIR is required when ORACLE_CLIENT_MODE=thick');
    const libDir = path.resolve(settings.clientLibDir);
    if (!existsSync(libDir)) throw new Error('Oracle Instant Client directory does not exist');
    if (!existsSync(path.join(libDir, 'oci.dll')))
      throw new Error('Oracle Instant Client oci.dll was not found in ORACLE_CLIENT_LIB_DIR');
    try {
      oracledb.initOracleClient({ libDir });
    } catch (error) {
      const code = oracleErrorCode(error);
      throw new Error(
        `${code ? `${code}: ` : ''}Oracle Client initialization failed. Verify ORACLE_CLIENT_LIB_DIR, required DLLs, and architecture compatibility.`,
        { cause: error },
      );
    }
    log({ clientMode: 'thick', oracleClientInitialized: true, oracleClientLibDir: libDir });
  } else {
    log({ clientMode: 'thin', oracleClientInitialized: true });
  }
  initializedMode = settings.clientMode;
}

export function oracleErrorCode(error: unknown): string | undefined {
  const candidate = error as {
    code?: string;
    errorNum?: number;
    message?: string;
    cause?: unknown;
  };
  if (candidate.code && /^(?:DPI|NJS|ORA)-\d+$/.test(candidate.code)) return candidate.code;
  if (candidate.errorNum) return `ORA-${String(candidate.errorNum).padStart(5, '0')}`;
  const match = candidate.message?.match(/\b(?:DPI|NJS|ORA)-\d+\b/);
  return match?.[0] ?? (candidate.cause ? oracleErrorCode(candidate.cause) : undefined);
}

const diagnosticHints: Record<string, string> = {
  'DPI-1047': 'Verify the Instant Client directory, DLL dependencies, and Node.js architecture.',
  'NJS-500': 'The Oracle connection was closed or is unavailable.',
  'NJS-503': 'Inspect the underlying Oracle or network error.',
  'NJS-511': 'The listener rejected or could not complete the connection.',
  'ORA-01017': 'Verify the Oracle username and local secret.',
  'ORA-12154': 'Verify the connect identifier and use host:port/service-name.',
  'ORA-12514': 'Verify that the listener advertises the configured service name.',
  'ORA-12541': 'Verify the host, port, listener, firewall, and network route.',
  'ORA-12545': 'Verify DNS/address resolution and network reachability.',
  'ORA-28000': 'Ask the DBA to unlock the development account.',
  'ORA-28001': 'Ask the DBA to rotate the expired password securely.',
};

export function oracleDiagnosticHint(error: unknown): string {
  const code = oracleErrorCode(error);
  return (
    (code && diagnosticHints[code]) ||
    'Review Oracle client, network, service, and account configuration.'
  );
}

export function maskOracleTarget(connectString: string): string {
  const slash = connectString.indexOf('/');
  return slash >= 0 ? `${connectString.slice(0, slash)}/***` : '***';
}

export function resetOracleClientForTests(): void {
  initializedMode = undefined;
}
