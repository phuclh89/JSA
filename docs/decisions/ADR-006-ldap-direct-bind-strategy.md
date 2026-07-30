# ADR-006: LDAP Direct Bind as the primary authentication strategy

## Status

Accepted on 2026-07-23. This supersedes only the mandatory service-account-search mechanism in ADR-005. All other ADR-005 security, identity-mapping, session, and authorization decisions remain accepted.

## Context

The internal Active Directory endpoint supports validating a user directly with the submitted account identity. The deployment does not require a service account for runtime login. JSAMS still needs directory attributes, including the stable `objectGUID`, after authentication and must support the username forms used by the enterprise domain.

## Decision

- Runtime login defaults to configurable `DIRECT_BIND`.
- In order, the API tries the submitted identity, normalized account name, configured UPN form, and configured NetBIOS form, removing case-insensitive duplicates.
- After a successful bind, the same authenticated connection performs an escaped exact search for the canonical username and stable identity/profile attributes.
- `SERVICE_SEARCH` remains an optional strategy and requires a least-privileged bind DN and password.
- Invalid credentials fail closed. Directory transport or search failures are reported as authentication-service unavailability and never as successful authentication.
- The submitted password remains request-scoped and is never persisted, hashed, cached, logged, audited, or returned.
- Production continues to require LDAPS or StartTLS; plain LDAP remains forbidden by production configuration validation.
- The signed HttpOnly JSAMS session and independent active-`SYS_USER` authorization checks remain unchanged.

## Consequences

Direct Bind removes the runtime dependency on a directory-reader secret and mirrors the established internal application pattern. The configured UPN suffix and NetBIOS domain become security-relevant deployment values. Each failed candidate can cause an AD authentication attempt, so rate limiting, account-lockout monitoring, and minimal candidate configuration are required production controls.

Directory-dependent administrative scripts may still require a least-privileged reader credential unless they are redesigned around an already authenticated user or an approved immutable identity input.
