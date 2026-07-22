import { registerAs } from '@nestjs/config';
export default registerAs('auth', () => ({
  mode: process.env.AUTH_MODE ?? 'development',
  oidcEnabled: process.env.OIDC_ENABLED === 'true',
}));
