import { registerAs } from '@nestjs/config';
export default registerAs('auth', () => ({
  mode: process.env.AUTH_MODE ?? 'development',
  oidcEnabled: process.env.OIDC_ENABLED === 'true',
  tenantId: process.env.OIDC_TENANT_ID,
  clientId: process.env.OIDC_CLIENT_ID,
  audience: process.env.OIDC_AUDIENCE,
}));
