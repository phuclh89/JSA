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

Implemented modules are `health`, `system`, `security`, `master-data`, `risk-matrix`, and `jsa-draft`; common infrastructure contains authentication/authorization guards, errors, correlation/logging, and Oracle access. Each business slice follows Controller -> Application Service -> Domain/Repository Port -> Oracle Adapter. Future business modules belong under `modules/` but must preserve dependency direction and may not depend on controllers. No empty future modules are created.

The global Oracle module initializes the selected client mode exactly once, then creates one pool at Nest module initialization and drains it on SIGINT/SIGTERM graceful shutdown. The current Windows development policy is mandatory Thick mode with the configured Instant Client; initialization or mandatory pool failure stops startup with a sanitized diagnostic. Every borrowed connection closes in `finally`. Application services define transaction scope; `withTransaction` commits success and rolls back failure. Dates/timestamps remain ISO-8601 strings at API boundaries, CLOBs are explicitly converted or streamed in repositories, rows use object output, and `NUMBER(19)` IDs are fetched/serialized as strings.

The API and Vite resolve environment configuration from the monorepo root. Nest development mode uses the Nest compiler so decorator metadata required for dependency injection is retained.

Correlation middleware accepts a bounded `X-Correlation-ID` or creates a UUID, exposes it using async-local context, and returns it in the response. JSON technical logs record request completion without bodies, credentials, tokens, or connection strings. Phase 1 supplies a security-audit service boundary and structured infrastructure sink; persistent business-audit storage remains deferred because no approved audit table exists.

Development header authentication is isolated behind the enterprise authentication guard and forbidden in production. It supplies only an identity hint and must resolve an active `SYS_USER`; it never grants code-configured permissions. OIDC mode validates issuer, audience, signature, and expiry against the configured tenant JWKS, maps the stable `oid`/`sub` plus username claim, and then resolves the same application-user context. Tokens are not returned to the frontend.

`GET /api/v1/auth/me` returns the normalized frontend session: string user/default IDs, identity/display data, active role codes, effective permissions, explicit overrides, resolved scopes, and non-sensitive authentication metadata. Effective permission precedence is explicit DENY -> explicit ALLOW -> active role grant -> default deny. Permission checks, workflow-role eligibility, and data-scope checks remain independent. Reusable permission and data-scope guards keep the API as the authorization boundary and audit denied privileged permission checks.

The Oracle security repository contains all security SQL and returns IDs with `TO_CHAR`. `UserContextService` owns the transaction around application-user and assignment resolution. Data-scope evaluation distinguishes view from action and respects site -> rig -> department hierarchy. No authorization cache is introduced, avoiding stale grants without an invalidation design.

Frontend startup calls `/auth/me`, models loading/authenticated/unauthenticated/unregistered/inactive states, centralizes permission-aware navigation, and protects direct routes. The responsive shell provides Browse and Operations areas, desktop/mobile navigation, action region, content region, and session display. Phase 2 adds administration screens for all governed master-data catalogues, Risk Matrix/version editing and preview, and effective-dated Rig assignment. Frontend checks improve navigation only; they never replace backend guards. Provider access tokens, when supplied by an OIDC integration, remain in memory rather than browser storage.

The Phase 2 Matrix engine is lookup-based. Display codes such as likelihood `5`, severity `D`, and rating `E` are independent text namespaces; optional numeric fields are metadata and never drive a formula. The API validates full Cartesian completeness before assignment. A never-assigned draft configuration is replaced atomically inside one transaction; any assignment makes that Matrix Version immutable. Per-Rig assignment writes lock the Rig row before checking half-open effective periods, preventing concurrent overlap races. Permission (`SYSTEM_ADMIN`), workflow role, and data scope remain separate; Phase 2 reuses the confirmed administrator permission and enforces Rig action/view scope in the API.

SQL migrations are explicit, checksummed, ordered, and paired with rollback. Migrations 002/003 create and align Phase 1; migration 004 creates Phase 2 master-data/Risk Matrix objects; migration 005 creates the Phase 3 JSA aggregate; migration 006 creates Phase 4 workflow/publication objects and immutability guards. DDL auto-commit limitations are documented in `database/README.md`.

Every Phase 1 table has its own Oracle sequence. Final numeric ranges remain deployment input, so migration 002 does not seed site/range/user data. The controlled bootstrap configures the allowlisted sequences from an approved range. With `LOCAL_SITE_ID` set, startup fails if a sequence has no valid local range, its next value is outside the range, or active ranges for the same sequence code overlap across sites.

Not implemented: translations, annual reviews, reporting, identity-provider login UI/redirect orchestration, GoldenGate deployment topology, external notification delivery, attachment binary storage, persistent general business-audit storage, security administration CRUD screens, and production infrastructure. Production master data, workflow routing, approver assignments, and Rig Matrix definitions remain configuration inputs rather than invented seed data.

## Phase 3 JSA Draft module

`jsa-draft` owns create, read, creator-only edit, aggregate content save, matrix-cell resolution, structured validation, and cancel. Controllers contain no SQL. `JsaDraftService` owns transactions and authorization; `JsaDraftValidationService` owns reusable validation; `JsaNumberService` is the governed numbering boundary; `OracleJsaDraftRepository` owns draft SQL. Attachment content has an explicit storage port, but no fake implementation exists.

Create captures the effective complete Matrix Version and inserts JSA Master, first Working Version, and pointer update in one transaction. Owner Site, Rig, and Department are immutable after creation because no transfer rule is approved. Only the creator may edit/cancel in Phase 3; takeover remains disabled. Aggregate saves upsert stable logical entities and soft-deactivate omitted children. Risk snapshots are derived by exact cell lookup against the captured Matrix Version; clients cannot submit rating/result snapshots.

JSA permission-code mapping and business-number format/scope are deployment configuration boundaries. All four capabilities must be supplied together and `SYSTEM_ADMIN` is never an implicit JSA capability. Numbering requires a template containing `{sequence}` plus an approved `GLOBAL` or `SITE` uniqueness scope. Missing configuration denies mutation.
## Phase 4 Approval workflow and publication

`JsaWorkflowModule` is separate from draft authoring. Its service orchestrates permissions, data scope, deterministic route preview, actions, and publication; its Oracle repository owns SQL and transaction-local locks.

Workflow definitions are versioned and contain ordered steps. Bindings select one definition using only Site, Rig, Department, and Job Type. Resolution orders by specificity then priority and rejects ties. Step assignees come from independent workflow-role assignments; each candidate must also hold the configured approval permission and ACT data scope. Zero or multiple eligible candidates fail closed.

Application permission, workflow role, and data scope remain independent: permission allows an action type, workflow role establishes step eligibility, and data scope controls the records that may be viewed or acted upon.

Submit locks and revalidates the Working Version. Return retains the Working Version and workflow instance, requires a reason, and increments the cycle on resubmission. Reject is terminal and preserves the Working Version pointer. Active approval cannot be cancelled.

Final approval performs revalidation, Version publication metadata, Current/Working pointer changes, Master publication, workflow completion, action evidence, and notification/outbox insertion in one Oracle transaction. It refuses initial publication when Current Version is already set. Database triggers reject later mutation of the Published Version aggregate.

Notifications are persisted in-app records with outbox intent. Phase 4 has no dispatcher and makes no email-delivery claim. Non-`ALWAYS` Rig Manager/test conditions fail in production until an approved deterministic rule exists.
