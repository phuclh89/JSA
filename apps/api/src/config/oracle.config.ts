import { registerAs } from '@nestjs/config';

export default registerAs('oracle', () => ({
  user: process.env.ORACLE_USER!,
  password: process.env.ORACLE_PASSWORD!,
  connectString: process.env.ORACLE_CONNECT_STRING!,
  poolMin: Number(process.env.ORACLE_POOL_MIN ?? 1),
  poolMax: Number(process.env.ORACLE_POOL_MAX ?? 10),
  poolIncrement: Number(process.env.ORACLE_POOL_INCREMENT ?? 1),
  poolTimeout: Number(process.env.ORACLE_POOL_TIMEOUT_SECONDS ?? 60),
  queueTimeout: Number(process.env.ORACLE_QUEUE_TIMEOUT_MS ?? 10000),
  stmtCacheSize: Number(process.env.ORACLE_STATEMENT_CACHE_SIZE ?? 50),
}));
