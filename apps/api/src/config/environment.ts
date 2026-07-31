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
    AUTH_MODE: z.enum(['development', 'ldap']).default('development'),
    LDAP_AUTH_STRATEGY: z.enum(['SERVICE_SEARCH', 'DIRECT_BIND']).default('SERVICE_SEARCH'),
    LDAP_HOST: z.string().optional(),
    LDAP_PORT: z.coerce.number().int().min(1).max(65535).default(389),
    LDAP_BIND_DN: z.string().optional(),
    LDAP_BIND_PASSWORD: z.string().optional(),
    LDAP_SEARCH_BASE: z.string().optional(),
    LDAP_USERNAME_ATTRIBUTE: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9-]*$/)
      .default('sAMAccountName'),
    LDAP_EMAIL_ATTRIBUTE: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9-]*$/)
      .default('mail'),
    LDAP_DISPLAY_NAME_ATTRIBUTE: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9-]*$/)
      .default('displayName'),
    LDAP_IDENTITY_ATTRIBUTE: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9-]*$/)
      .default('objectGUID'),
    LDAP_UPN_SUFFIX: z.string().min(1).default('pvdrilling.com.vn'),
    LDAP_NETBIOS_DOMAIN: z.string().min(1).default('PVDRILLING'),
    LDAP_TLS_MODE: z.enum(['LDAPS', 'STARTTLS', 'NONE']).default('STARTTLS'),
    LDAP_TLS_LEGACY_COMPATIBILITY: booleanString.default('false'),
    LDAP_CONNECT_TIMEOUT_MS: positiveInteger.default(5000),
    LDAP_OPERATION_TIMEOUT_MS: positiveInteger.default(10000),
    LDAP_ALLOW_USERNAME_FALLBACK: booleanString.default('false'),
    AUTH_SESSION_SECRET: z.string().optional(),
    AUTH_SESSION_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(480),
    AUTH_SESSION_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('jsams_session'),
    AUTH_SESSION_COOKIE_SECURE: booleanString.default('false'),
    LOCAL_SITE_CODE: z.string().min(1).default('DEV'),
    LOCAL_SITE_ID: z.string().optional(),
    JSA_PERMISSION_VIEW: optionalNonEmpty,
    JSA_PERMISSION_CREATE: optionalNonEmpty,
    JSA_PERMISSION_EDIT: optionalNonEmpty,
    JSA_PERMISSION_CANCEL: optionalNonEmpty,
    JSA_PERMISSION_UPDATE: optionalNonEmpty,
    JSA_PERMISSION_COMPARE: optionalNonEmpty,
    JSA_PERMISSION_UNDO_CHECKOUT: optionalNonEmpty,
    JSA_PERMISSION_FAVORITE: optionalNonEmpty,
    JSA_PERMISSION_COPY: optionalNonEmpty,
    JSA_PERMISSION_TRANSLATION_VIEW: optionalNonEmpty,
    JSA_PERMISSION_TRANSLATION_ASSIGN: optionalNonEmpty,
    JSA_PERMISSION_TRANSLATE: optionalNonEmpty,
    JSA_PERMISSION_TRANSLATION_APPROVE: optionalNonEmpty,
    JSA_PERMISSION_TRANSLATION_PRINT: optionalNonEmpty,
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
    ATTACHMENT_STORAGE_ROOT: optionalNonEmpty,
    ATTACHMENT_MAX_FILE_SIZE_BYTES: z.coerce
      .number()
      .int()
      .min(1_048_576)
      .max(104_857_600)
      .default(52_428_800),
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
    if (value.AUTH_MODE === 'ldap' && (!value.LDAP_HOST || !value.LDAP_SEARCH_BASE)) {
      context.addIssue({
        code: 'custom',
        path: ['LDAP_HOST'],
        message: 'LDAP host and search base are required in LDAP mode',
      });
    }
    if (
      value.AUTH_MODE === 'ldap' &&
      value.LDAP_AUTH_STRATEGY === 'SERVICE_SEARCH' &&
      (!value.LDAP_BIND_DN || !value.LDAP_BIND_PASSWORD)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['LDAP_BIND_DN'],
        message: 'LDAP bind DN and password are required for SERVICE_SEARCH',
      });
    }
    if (
      value.AUTH_MODE === 'ldap' &&
      (!value.AUTH_SESSION_SECRET || value.AUTH_SESSION_SECRET.length < 32)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_SESSION_SECRET'],
        message: 'a session secret of at least 32 characters is required in LDAP mode',
      });
    }
    if (
      value.NODE_ENV === 'production' &&
      value.AUTH_MODE === 'ldap' &&
      value.LDAP_TLS_MODE === 'NONE'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['LDAP_TLS_MODE'],
        message: 'unencrypted LDAP is forbidden in production',
      });
    }
    if (value.NODE_ENV === 'production' && value.LDAP_TLS_LEGACY_COMPATIBILITY) {
      context.addIssue({
        code: 'custom',
        path: ['LDAP_TLS_LEGACY_COMPATIBILITY'],
        message: 'legacy insecure LDAP TLS compatibility is forbidden in production',
      });
    }
    if (value.NODE_ENV === 'production' && !value.AUTH_SESSION_COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_SESSION_COOKIE_SECURE'],
        message: 'secure session cookies are required in production',
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
    const jsaPermissionValues = [
      value.JSA_PERMISSION_VIEW,
      value.JSA_PERMISSION_CREATE,
      value.JSA_PERMISSION_EDIT,
      value.JSA_PERMISSION_CANCEL,
    ];
    if (jsaPermissionValues.some(Boolean) && !jsaPermissionValues.every(Boolean))
      context.addIssue({
        code: 'custom',
        path: ['JSA_PERMISSION_VIEW'],
        message: 'all four JSA permission mappings must be configured together',
      });
    const revisionPermissionValues = [
      value.JSA_PERMISSION_UPDATE,
      value.JSA_PERMISSION_COMPARE,
      value.JSA_PERMISSION_UNDO_CHECKOUT,
    ];
    if (revisionPermissionValues.some(Boolean) && !revisionPermissionValues.every(Boolean))
      context.addIssue({
        code: 'custom',
        path: ['JSA_PERMISSION_UPDATE'],
        message: 'all three JSA revision permission mappings must be configured together',
      });
    if (value.NODE_ENV === 'production' && !revisionPermissionValues.every(Boolean))
      context.addIssue({
        code: 'custom',
        path: ['JSA_PERMISSION_UPDATE'],
        message: 'JSA revision permission mappings are required in production',
      });
    if (value.NODE_ENV === 'production' && !value.JSA_PERMISSION_FAVORITE)
      context.addIssue({
        code: 'custom',
        path: ['JSA_PERMISSION_FAVORITE'],
        message: 'JSA favorite permission mapping is required in production',
      });
    if (value.NODE_ENV === 'production' && !value.JSA_PERMISSION_COPY)
      context.addIssue({
        code: 'custom',
        path: ['JSA_PERMISSION_COPY'],
        message: 'JSA Copy permission mapping is required in production',
      });
    const translationPermissionValues = [
      value.JSA_PERMISSION_TRANSLATION_VIEW,
      value.JSA_PERMISSION_TRANSLATION_ASSIGN,
      value.JSA_PERMISSION_TRANSLATE,
      value.JSA_PERMISSION_TRANSLATION_APPROVE,
      value.JSA_PERMISSION_TRANSLATION_PRINT,
    ];
    if (translationPermissionValues.some(Boolean) && !translationPermissionValues.every(Boolean))
      context.addIssue({
        code: 'custom',
        path: ['JSA_PERMISSION_TRANSLATION_VIEW'],
        message: 'all five Translation permission mappings must be configured together',
      });
    if (value.NODE_ENV === 'production' && !translationPermissionValues.every(Boolean))
      context.addIssue({
        code: 'custom',
        path: ['JSA_PERMISSION_TRANSLATION_VIEW'],
        message: 'Translation permission mappings are required in production',
      });
    const workflowPermissionValues = [
      value.JSA_PERMISSION_SUBMIT,
      value.JSA_PERMISSION_APPROVE,
      value.JSA_PERMISSION_RETURN,
      value.JSA_PERMISSION_REJECT,
      value.JSA_PERMISSION_COMMENT,
      value.JSA_PERMISSION_WORKFLOW_VIEW,
      value.JSA_PERMISSION_WORKFLOW_ADMIN,
    ];
    if (workflowPermissionValues.some(Boolean) && !workflowPermissionValues.every(Boolean))
      context.addIssue({
        code: 'custom',
        path: ['JSA_PERMISSION_SUBMIT'],
        message: 'all seven workflow permission mappings must be configured together',
      });
    if (value.NODE_ENV === 'production' && !workflowPermissionValues.every(Boolean))
      context.addIssue({
        code: 'custom',
        path: ['JSA_PERMISSION_SUBMIT'],
        message: 'workflow permission mappings are required in production',
      });
    if (Boolean(value.JSA_NUMBER_TEMPLATE) !== Boolean(value.JSA_NUMBER_UNIQUENESS_SCOPE))
      context.addIssue({
        code: 'custom',
        path: ['JSA_NUMBER_TEMPLATE'],
        message: 'JSA numbering template and uniqueness scope must be configured together',
      });
    if (value.JSA_NUMBER_TEMPLATE && !value.JSA_NUMBER_TEMPLATE.includes('{sequence}'))
      context.addIssue({
        code: 'custom',
        path: ['JSA_NUMBER_TEMPLATE'],
        message: 'must include {sequence}',
      });
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
