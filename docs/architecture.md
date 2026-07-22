# Architecture

```text
React/Vite + TanStack Query
            |
       HTTPS JSON
            |
NestJS modular monolith
 Controller → Application → Domain → Repository port → Oracle adapter
            |
   node-oracledb pool
            |
      Oracle 19c+
```

Phase 1 modules are `health`, `system`, and `security`; common infrastructure contains authentication/authorization guards, errors, correlation/logging, and Oracle access. The security module follows Controller -> Application Service -> Domain/Repository Port -> Oracle Adapter. Future business modules belong under `modules/` but must preserve dependency direction and may not depend on controllers. No empty future modules are created.

The global Oracle module initializes the selected client mode exactly once, then creates one pool at Nest module initialization and drains it on SIGINT/SIGTERM graceful shutdown. The current Windows development policy is mandatory Thick mode with the configured Instant Client; initialization or mandatory pool failure stops startup with a sanitized diagnostic. Every borrowed connection closes in `finally`. Application services define transaction scope; `withTransaction` commits success and rolls back failure. Dates/timestamps remain ISO-8601 strings at API boundaries, CLOBs are explicitly converted or streamed in repositories, rows use object output, and `NUMBER(19)` IDs are fetched/serialized as strings.

The API and Vite resolve environment configuration from the monorepo root. Nest development mode uses the Nest compiler so decorator metadata required for dependency injection is retained.

Correlation middleware accepts a bounded `X-Correlation-ID` or creates a UUID, exposes it using async-local context, and returns it in the response. JSON technical logs record request completion without bodies, credentials, tokens, or connection strings. Phase 1 supplies a security-audit service boundary and structured infrastructure sink; persistent business-audit storage remains deferred because no approved audit table exists.

Development header authentication is isolated behind the enterprise authentication guard and forbidden in production. It supplies only an identity hint and must resolve an active `SYS_USER`; it never grants code-configured permissions. OIDC mode validates issuer, audience, signature, and expiry against the configured tenant JWKS, maps the stable `oid`/`sub` plus username claim, and then resolves the same application-user context. Tokens are not returned to the frontend.

`GET /api/v1/auth/me` returns the normalized frontend session: string user/default IDs, identity/display data, active role codes, effective permissions, explicit overrides, resolved scopes, and non-sensitive authentication metadata. Effective permission precedence is explicit DENY -> explicit ALLOW -> active role grant -> default deny. Permission checks, workflow-role eligibility, and data-scope checks remain independent. Reusable permission and data-scope guards keep the API as the authorization boundary and audit denied privileged permission checks.

The Oracle security repository contains all security SQL and returns IDs with `TO_CHAR`. `UserContextService` owns the transaction around application-user and assignment resolution. Data-scope evaluation distinguishes view from action and respects site -> rig -> department hierarchy. No authorization cache is introduced, avoiding stale grants without an invalidation design.

Phase 1 frontend startup calls `/auth/me`, models loading/authenticated/unauthenticated/unregistered/inactive states, centralizes permission-aware navigation, and protects direct routes. The responsive shell provides Browse and Operations areas, desktop/mobile navigation, action region, content region, and session display. Frontend checks improve navigation only; they never replace backend guards. Provider access tokens, when supplied by an OIDC integration, remain in memory rather than browser storage.

SQL migrations are explicit, checksummed, ordered, and paired with rollback. Migration 002 creates the Phase 1 foundation and no later JSA schema. DDL auto-commit limitations are documented in `database/README.md`.

Every Phase 1 table has its own Oracle sequence. Final numeric ranges remain deployment input, so migration 002 does not seed site/range/user data. The controlled bootstrap configures the allowlisted sequences from an approved range. With `LOCAL_SITE_ID` set, startup fails if a sequence has no valid local range, its next value is outside the range, or active ranges for the same sequence code overlap across sites.

Not implemented: identity-provider login UI/redirect orchestration, GoldenGate deployment topology, email/notifications, attachment storage, persistent business-audit storage, security administration CRUD screens, and production infrastructure.
