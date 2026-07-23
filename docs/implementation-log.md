# Implementation log

## Phase 4 — Approval Workflow and Initial Publishing (2026-07-23)

- Added migration/rollback 006 with versioned definitions, ordered steps, approved-dimension bindings, independent workflow-role assignments, instances/tasks/actions, notification/outbox records, publication metadata, nine sequences, and Published immutability triggers.
- Added deterministic unique-assignee preview, submit/resubmit, approve, return, reject, comment, queues, configuration/role-assignment APIs, atomic initial publication, and fail-closed production conditions.
- Kept permission, workflow eligibility, and data scope independent. Return retains the Working Version and instance with a new resubmission cycle; Reject is terminal; active approval cannot be cancelled.
- Integrated Save & Submit into the one-screen editor and added Needs Approval, Pending, Rejected, Published, workflow review/history/action, and administration screens.
- Added Phase 4 sequence bootstrap/startup validation and real-Oracle verification. No production code, route, assignee, or Rig Manager condition was invented.
- `docs/state.md` was not changed because no business decision was newly confirmed.

## Phase 3 — JSA Draft Core (2026-07-23)

- Added migration/rollback 005 with JSA Master, Draft Version, prompt/coverage, Task/Hazard/Control, independent risk snapshots, Basic Job Steps and snapshot assignments, procedure snapshots, attachment metadata, logical keys, optimistic versions, composite same-version FKs, and explicit sequences.
- Added controlled Phase 3 sequence bootstrap and startup range validation. No Site/range, permission, numbering, reference, or JSA seed was added.
- Added modular `jsa-draft` backend: fail-closed capabilities, governed numbering, atomic create, creator/scope edit enforcement, immutable ownership, aggregate upsert/soft-deactivate, exact matrix-cell resolution, structured validation, cancellation, audit events, and attachment storage port.
- Added shared contracts and responsive `/jsa/new` plus `/jsa/:id/draft` UI with all Phase 3 sections and states. Approval submission is disabled with a Phase 4 explanation.
- Reworked the JSA Draft editor into one continuous worksheet to preserve the legacy system's familiar data-entry model. General information, Hazard Assessment Prompts, the configured Risk Matrix, Task/Hazard/Control assessment, Basic Job Steps, references, attachments, validation, and draft actions now appear together without a tab workflow.
- Added compact P/S/R risk columns, Probability and Severity definition dialogs, configured Matrix lookup/legend, responsive horizontally scrollable operational tables, and dual-list dialogs for Performer Position, Supervisor Position, and Tool selection. The presentation keeps the confirmed multi-Hazard, multi-Control, separate Basic Job Step, snapshot, and server-derived risk rules unchanged.
- Added schema, validation, capability-route, and transaction-rolled-back real Oracle behavior tests.
- `docs/state.md` was not changed: implementation followed existing confirmed behavior; permission codes, numbering policy, takeover, and storage remain open decisions.
- `docs/DESIGN.md` was not changed: existing palette, spacing, radii, breakpoints, interactions, accessibility, and reduced-motion rules were reused; no reusable design rule was introduced.

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

## Phase 2 — 2026-07-22

Added immutable migration 004 and its isolated rollback for eight governed master-data catalogues plus the versioned Risk Matrix model: 15 tables, 15 `NUMBER(19)` sequences, scoped active-code uniqueness, relational Site/Rig/Department hierarchy, Tool Category ownership, typed System Parameters, explicit 3×3/5×5 axes/results/cells, mixed textual code namespaces, effective-dated Rig assignments, audit columns, and optimistic row versions. No production master data or Matrix values were seeded.

Added transactional NestJS `master-data` and `risk-matrix` slices with repository ports and Oracle adapters. The APIs provide searchable/paginated catalogue administration, safe deactivation/reactivation, typed parameter validation, Matrix/version/configuration CRUD, completeness validation, lookup preview, immutable assigned versions, serialized Rig overlap checks, exact effective-version resolution, required security audit calls, `SYSTEM_ADMIN` authorization, and independent Rig data-scope enforcement.

Added responsive administrator pages for every Phase 2 catalogue, Matrix/version list, full axis/result/cell editor, lookup-driven preview/legend, incomplete-state messaging, and Rig assignment management. Tool editing selects a real active Tool Category. Navigation and direct routes use the existing centralized permission model and design-system tokens.

Added a deployment-only Phase 2 sequence bootstrap, real-Oracle transactional behavior verifier, schema/unit tests, backend mixed-code/completeness/parameter tests, and frontend administration/preview tests. Migration 004 was applied, verified, rolled back in isolation, and reapplied on the confirmed development schema. Phase 1 business bootstrap, Phase 2 sequence bootstrap, official catalogue data, and official Rig Matrix configuration remain intentionally unexecuted because their approved environment/business inputs were not supplied.
