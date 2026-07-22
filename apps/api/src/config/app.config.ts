import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  name: process.env.APP_NAME ?? 'JSAMS',
  port: Number(process.env.APP_PORT ?? 3000),
  prefix: process.env.API_PREFIX ?? '/api',
  version: process.env.API_VERSION ?? 'v1',
  environment: process.env.NODE_ENV ?? 'development',
  corsOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((value) => value.trim()),
  siteId: process.env.LOCAL_SITE_ID || undefined,
}));
