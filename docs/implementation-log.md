# Implementation log

## Phase 0 — 2026-07-22

Added root workspace/tooling configuration; shared API/auth types and permission constants; NestJS config, Oracle, health, system, auth, logging, correlation, error handling and Swagger; React providers, shell, routing, guards, API client and health UI; Oracle migration SQL and status/up/down runners; CI and technical documentation.

Technical choices: pnpm workspaces, Zod startup validation, one lifecycle-managed Oracle pool, `AsyncLocalStorage` correlation context, development-only code-configured users, direct SQL with SHA-256 migration checksums, and public operational health endpoints.

Deferred: all business modules and schema, production OIDC/hosting/deployment, GoldenGate, storage, notification, and final site/sequence decisions. Known limitation: real Oracle verification depends on credentials and an accessible instance; Oracle DDL is non-transactional.

## Phase 0A — 2026-07-22

Added one-time Thin/Thick Oracle client initialization, client-path checks, safe Oracle/NJS diagnostics, `oracle:diagnose`, `oracle:readiness`, opt-in `oracle:test`, real-pool integration tests, migration Thick initialization, explicit development rollback confirmation and schema/service checks, PL/SQL/slash/CRLF-aware migration parsing tests, and a DBA-reviewed development-schema example. Updated environment validation, root/database documentation, architecture, state, deployment policy, testing log, and ADR.

The existing one-pool mandatory-startup policy is preserved. No business module/table was added and no credential was placed in source.

Real execution fixes: root `db:up` collided with pnpm's built-in update command and now delegates through `pnpm run`; Nest and Vite now resolve the monorepo-root `.env`; Nest development startup uses the Nest compiler instead of esbuild-based `tsx` so decorator metadata is preserved. Added `db:verify` and reusable real API smoke with graceful `app.close()`.

Real verification completed against `JSA_APP@PDBAPPS`: Oracle 23.0.0.0.0, Thick Client 23.9, migration lifecycle, checksum guard, controlled rollback/reapply, HTTP health, repeated readiness, pool close, and integration transaction cleanup. Frontend visual browser inspection remained unavailable because the in-app browser had no active session.

## Phase 1 — 2026-07-22

Added immutable migrations 002/003 and matching rollbacks for the Oracle site/security foundation: 11 `SYS_*` tables, one `NUMBER(19)` sequence per table, named PK/FK/UK/check constraints, hierarchy and authorization indexes, function-based uniqueness for active assignments, governed site ranges, soft revocation, optimistic row versions, and GoldenGate-stable identifiers. Migration 003 preserves applied-migration immutability while aligning final unique-index names with repository conventions.

Added a deployment-configured Phase 1 bootstrap that refuses missing, invalid, undersized, or overlapping ranges; configures only allowlisted sequences; and creates only the confirmed system permissions, administrator role/user mapping, and site scope. It was intentionally not executed because final site identity, range, and administrator identity remain unconfirmed business/deployment inputs. With `LOCAL_SITE_ID` configured, startup validates active per-sequence range overlap and local sequence position.

Added the security modular-monolith slice: enterprise principal extraction, Entra-compatible OIDC JWT/JWKS validation, development identity hints that still resolve through `SYS_USER`, active-user enforcement, transactional Oracle repository resolution, string ID handling, role permissions, deterministic DENY/ALLOW overrides, view/action data scopes, permission and scope guards, structured required security audit boundary, safe Oracle constraint mapping, and original-error-preserving transaction rollback. `GET /api/v1/auth/me` returns only normalized non-sensitive session context.

Replaced code-configured frontend users with asynchronous session bootstrap, explicit unauthenticated/unregistered/inactive states, in-memory token-provider integration, protected routes, centralized permission-aware navigation, Access Denied handling, and a responsive Browse/Operations shell. The shell follows the repository design system with its near-black/lime palette, pill interactions, rounded ring surfaces, and mobile navigation behavior. Phase 2+ JSA features and operational administration CRUD were not added.

Real Oracle verification applied migration 002, verified 11 tables/sequences and `NUMBER(19)` keys, rolled 002 back while retaining migration 001, and reapplied it. Migration 003 was then applied, rolled back, reapplied, and verified. API startup initially exposed a missing module export; after correction, real Oracle health, repeated readiness, and graceful pool shutdown passed.
