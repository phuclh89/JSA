# ADR-005: Internal Active Directory authentication through LDAP

## Status

Accepted on 2026-07-23. This supersedes the OIDC-specific authentication portion of the Phase 0/Phase 1 architecture; the separation between enterprise authentication and JSAMS authorization remains unchanged.

## Context

JSAMS is an internal application and the confirmed deployment decision is to authenticate directly against the enterprise Active Directory rather than Microsoft Entra OIDC. JSAMS must still retain its own governed application users, permissions, workflow roles, and data scopes without owning directory accounts or password lifecycle.

## Decision

- The browser submits enterprise username/password only to the JSAMS API over TLS.
- The API uses a least-privileged service-account bind to search one configured subtree for the exact configured username attribute.
- The API binds as the discovered user DN to validate the password.
- The password is request-scoped and is never persisted, hashed, cached, logged, audited, or returned.
- `objectGUID` is the preferred stable external identity key; configured username, display-name, and email attributes provide operational/profile values.
- Successful LDAP authentication issues a short-lived API-signed session in an `HttpOnly`, `SameSite=Strict` cookie. Production cookies are `Secure`.
- Every authenticated request reloads the active `SYS_USER` and current JSAMS authorization assignments.
- Production LDAP transport must use LDAPS or StartTLS. Plain LDAP is allowed only as an explicit non-production compatibility setting.
- JSAMS does not provision or administer Active Directory accounts, passwords, groups, or lockout policy.

## Consequences

The API transiently handles an enterprise password and therefore HTTPS, protected process memory, sanitized logging, least-privileged bind credentials, LDAP transport encryption, secret rotation, and upstream login rate limiting are mandatory production controls. Stateless signed sessions do not provide distributed immediate revocation, although deactivating `SYS_USER` takes effect on the next API request. A future distributed revocation design requires a superseding ADR.

The current development Domain Controller uses a legacy LDAPS signature algorithm rejected by the default Node/OpenSSL policy. A named compatibility flag may lower TLS verification only in development/UAT and is rejected during production configuration validation. Replacing the Domain Controller certificate is a production prerequisite.
