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

Phase 0 modules are `health` and `system`; common infrastructure contains auth, errors, correlation/logging, and Oracle access. Future business modules belong under `modules/` but must preserve dependency direction and may not depend on controllers. No empty future modules are created.

The global Oracle module creates one pool at Nest module initialization and drains it on graceful shutdown. Every borrowed connection closes in `finally`. Application services define transaction scope; `withTransaction` commits success and rolls back failure. Dates/timestamps remain ISO-8601 strings at API boundaries, CLOBs are explicitly converted or streamed in repositories, rows use object output, and `NUMBER(19)` IDs are fetched/serialized as strings.

Correlation middleware accepts a bounded `X-Correlation-ID` or creates a UUID, exposes it using async-local context, and returns it in the response. JSON technical logs record request completion without bodies, credentials, tokens, or connection strings. Business audit records are separate and deferred.

Development header authentication is isolated behind an auth guard and forbidden in production. Token validation and external identity mapping are ports for future enterprise OIDC. Permission and future data-scope guards keep the API as the authorization boundary.

SQL migrations are explicit, checksummed, ordered, and paired with rollback. DDL auto-commit limitations are documented in `database/README.md`.

Not implemented: enterprise OIDC, GoldenGate, email/notifications, attachment storage, business audit persistence, and production infrastructure.
