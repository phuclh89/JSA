import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  mode: process.env.AUTH_MODE ?? 'development',
  ldap: {
    strategy: process.env.LDAP_AUTH_STRATEGY ?? 'SERVICE_SEARCH',
    host: process.env.LDAP_HOST,
    port: Number(process.env.LDAP_PORT ?? 389),
    bindDn: process.env.LDAP_BIND_DN,
    bindPassword: process.env.LDAP_BIND_PASSWORD,
    searchBase: process.env.LDAP_SEARCH_BASE,
    usernameAttribute: process.env.LDAP_USERNAME_ATTRIBUTE ?? 'sAMAccountName',
    emailAttribute: process.env.LDAP_EMAIL_ATTRIBUTE ?? 'mail',
    displayNameAttribute: process.env.LDAP_DISPLAY_NAME_ATTRIBUTE ?? 'displayName',
    identityAttribute: process.env.LDAP_IDENTITY_ATTRIBUTE ?? 'objectGUID',
    upnSuffix: process.env.LDAP_UPN_SUFFIX ?? 'pvdrilling.com.vn',
    netbiosDomain: process.env.LDAP_NETBIOS_DOMAIN ?? 'PVDRILLING',
    tlsMode: process.env.LDAP_TLS_MODE ?? 'STARTTLS',
    legacyTlsCompatibility: process.env.LDAP_TLS_LEGACY_COMPATIBILITY === 'true',
    connectTimeoutMs: Number(process.env.LDAP_CONNECT_TIMEOUT_MS ?? 5000),
    operationTimeoutMs: Number(process.env.LDAP_OPERATION_TIMEOUT_MS ?? 10000),
    allowUsernameFallback: process.env.LDAP_ALLOW_USERNAME_FALLBACK === 'true',
  },
  session: {
    secret: process.env.AUTH_SESSION_SECRET,
    ttlMinutes: Number(process.env.AUTH_SESSION_TTL_MINUTES ?? 480),
    cookieName: process.env.AUTH_SESSION_COOKIE_NAME ?? 'jsams_session',
    secure: process.env.AUTH_SESSION_COOKIE_SECURE === 'true',
  },
}));
