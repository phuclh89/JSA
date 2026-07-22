# Implementation log

## Phase 0 — 2026-07-22

Added root workspace/tooling configuration; shared API/auth types and permission constants; NestJS config, Oracle, health, system, auth, logging, correlation, error handling and Swagger; React providers, shell, routing, guards, API client and health UI; Oracle migration SQL and status/up/down runners; CI and technical documentation.

Technical choices: pnpm workspaces, Zod startup validation, one lifecycle-managed Oracle pool, `AsyncLocalStorage` correlation context, development-only code-configured users, direct SQL with SHA-256 migration checksums, and public operational health endpoints.

Deferred: all business modules and schema, production OIDC/hosting/deployment, GoldenGate, storage, notification, and final site/sequence decisions. Known limitation: real Oracle verification depends on credentials and an accessible instance; Oracle DDL is non-transactional.
