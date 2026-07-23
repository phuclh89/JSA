import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');
const positiveInteger = z.coerce.number().int().positive();
const optionalNonEmpty = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_NAME: z.string().min(1).default('JSAMS'),
    APP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    API_PREFIX: z.string().regex(/^\//).default('/api'),
    API_VERSION: z.string().min(1).default('v1'),
    CORS_ALLOWED_ORIGINS: z.string().min(1).default('http://localhost:5173'),
    ORACLE_CLIENT_MODE: z.enum(['thin', 'thick']).default('thin'),
    ORACLE_USER: z.string().min(1),
    ORACLE_PASSWORD: z.string().min(1),
    ORACLE_CONNECT_STRING: z.string().min(1),
    ORACLE_CLIENT_LIB_DIR: z.string().optional(),
    ORACLE_POOL_MIN: z.coerce.number().int().min(0).default(1),
    ORACLE_POOL_MAX: positiveInteger.default(10),
    ORACLE_POOL_INCREMENT: positiveInteger.default(1),
    ORACLE_POOL_TIMEOUT_SECONDS: positiveInteger.default(60),
    ORACLE_QUEUE_TIMEOUT_MS: positiveInteger.default(10000),
    ORACLE_STATEMENT_CACHE_SIZE: z.coerce.number().int().min(0).default(50),
    ORACLE_CONNECTION_TIMEOUT_MS: positiveInteger.default(10000),
    ORACLE_ENABLE_EVENTS: booleanString.default('false'),
    RUN_ORACLE_INTEGRATION_TESTS: booleanString.default('false'),
    AUTH_MODE: z.enum(['development', 'oidc']).default('development'),
    OIDC_ENABLED: booleanString.default('false'),
    OIDC_TENANT_ID: z.string().optional(),
    OIDC_CLIENT_ID: z.string().optional(),
    OIDC_AUDIENCE: z.string().optional(),
    LOCAL_SITE_CODE: z.string().min(1).default('DEV'),
    LOCAL_SITE_ID: z.string().optional(),
    JSA_PERMISSION_VIEW: optionalNonEmpty,
    JSA_PERMISSION_CREATE: optionalNonEmpty,
    JSA_PERMISSION_EDIT: optionalNonEmpty,
    JSA_PERMISSION_CANCEL: optionalNonEmpty,
    JSA_PERMISSION_SUBMIT: optionalNonEmpty,
    JSA_PERMISSION_APPROVE: optionalNonEmpty,
    JSA_PERMISSION_RETURN: optionalNonEmpty,
    JSA_PERMISSION_REJECT: optionalNonEmpty,
    JSA_PERMISSION_COMMENT: optionalNonEmpty,
    JSA_PERMISSION_WORKFLOW_VIEW: optionalNonEmpty,
    JSA_PERMISSION_WORKFLOW_ADMIN: optionalNonEmpty,
    JSA_NUMBER_TEMPLATE: optionalNonEmpty,
    JSA_NUMBER_UNIQUENESS_SCOPE: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(['GLOBAL', 'SITE']).optional(),
    ),
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
    if (value.AUTH_MODE === 'oidc' && !value.OIDC_ENABLED) {
      context.addIssue({
        code: 'custom',
        path: ['OIDC_ENABLED'],
        message: 'must be true when AUTH_MODE=oidc',
      });
    }
    if (value.ORACLE_POOL_MIN > value.ORACLE_POOL_MAX) {
      context.addIssue({
        code: 'custom',
        path: ['ORACLE_POOL_MIN'],
        message: 'must not exceed ORACLE_POOL_MAX',
      });
    }
    if (value.ORACLE_CLIENT_MODE === 'thick' && !value.ORACLE_CLIENT_LIB_DIR) {
      context.addIssue({
        code: 'custom',
        path: ['ORACLE_CLIENT_LIB_DIR'],
        message: 'is required when ORACLE_CLIENT_MODE=thick',
      });
    }
    const jsaPermissionValues = [value.JSA_PERMISSION_VIEW,value.JSA_PERMISSION_CREATE,value.JSA_PERMISSION_EDIT,value.JSA_PERMISSION_CANCEL];
    if (jsaPermissionValues.some(Boolean) && !jsaPermissionValues.every(Boolean)) context.addIssue({ code:'custom', path:['JSA_PERMISSION_VIEW'], message:'all four JSA permission mappings must be configured together' });
    const workflowPermissionValues=[value.JSA_PERMISSION_SUBMIT,value.JSA_PERMISSION_APPROVE,value.JSA_PERMISSION_RETURN,value.JSA_PERMISSION_REJECT,value.JSA_PERMISSION_COMMENT,value.JSA_PERMISSION_WORKFLOW_VIEW,value.JSA_PERMISSION_WORKFLOW_ADMIN];
    if(workflowPermissionValues.some(Boolean)&&!workflowPermissionValues.every(Boolean))context.addIssue({code:'custom',path:['JSA_PERMISSION_SUBMIT'],message:'all seven workflow permission mappings must be configured together'});
    if(value.NODE_ENV==='production'&&!workflowPermissionValues.every(Boolean))context.addIssue({code:'custom',path:['JSA_PERMISSION_SUBMIT'],message:'workflow permission mappings are required in production'});
    if (Boolean(value.JSA_NUMBER_TEMPLATE) !== Boolean(value.JSA_NUMBER_UNIQUENESS_SCOPE)) context.addIssue({ code:'custom', path:['JSA_NUMBER_TEMPLATE'], message:'JSA numbering template and uniqueness scope must be configured together' });
    if (value.JSA_NUMBER_TEMPLATE && !value.JSA_NUMBER_TEMPLATE.includes('{sequence}')) context.addIssue({ code:'custom', path:['JSA_NUMBER_TEMPLATE'], message:'must include {sequence}' });
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
