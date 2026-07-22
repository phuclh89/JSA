import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');
const positiveInteger = z.coerce.number().int().positive();

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_NAME: z.string().min(1).default('JSAMS'),
    APP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    API_PREFIX: z.string().regex(/^\//).default('/api'),
    API_VERSION: z.string().min(1).default('v1'),
    CORS_ALLOWED_ORIGINS: z.string().min(1).default('http://localhost:5173'),
    ORACLE_USER: z.string().min(1),
    ORACLE_PASSWORD: z.string().min(1),
    ORACLE_CONNECT_STRING: z.string().min(1),
    ORACLE_POOL_MIN: z.coerce.number().int().min(0).default(1),
    ORACLE_POOL_MAX: positiveInteger.default(10),
    ORACLE_POOL_INCREMENT: positiveInteger.default(1),
    ORACLE_POOL_TIMEOUT_SECONDS: positiveInteger.default(60),
    ORACLE_QUEUE_TIMEOUT_MS: positiveInteger.default(10000),
    ORACLE_STATEMENT_CACHE_SIZE: z.coerce.number().int().min(0).default(50),
    AUTH_MODE: z.enum(['development', 'oidc']).default('development'),
    OIDC_ENABLED: booleanString.default('false'),
    OIDC_TENANT_ID: z.string().optional(),
    OIDC_CLIENT_ID: z.string().optional(),
    OIDC_AUDIENCE: z.string().optional(),
    LOCAL_SITE_CODE: z.string().min(1).default('DEV'),
    LOCAL_SITE_ID: z.string().optional(),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && value.AUTH_MODE === 'development') {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_MODE'],
        message: 'development authentication is forbidden in production',
      });
    }
    if (
      value.OIDC_ENABLED &&
      (!value.OIDC_TENANT_ID || !value.OIDC_CLIENT_ID || !value.OIDC_AUDIENCE)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['OIDC_ENABLED'],
        message: 'OIDC tenant, client, and audience are required when OIDC is enabled',
      });
    }
    if (value.ORACLE_POOL_MIN > value.ORACLE_POOL_MAX) {
      context.addIssue({
        code: 'custom',
        path: ['ORACLE_POOL_MIN'],
        message: 'must not exceed ORACLE_POOL_MAX',
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid application configuration: ${errors}`);
  }
  return result.data;
}
