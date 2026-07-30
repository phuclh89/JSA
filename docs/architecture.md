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

Implemented modules are `health`, `system`, `security`, `master-data`, `risk-matrix`, `jsa-draft`, `jsa-workflow`, `access-administration`, and `attachment-library`; common infrastructure contains authentication/authorization guards, errors, correlation/logging, and Oracle access. Each business slice follows Controller -> Application Service -> Domain/Repository Port -> Oracle Adapter. Future business modules belong under `modules/` but must preserve dependency direction and may not depend on controllers. No empty future modules are created.

The global Oracle module initializes the selected client mode exactly once, then creates one pool at Nest module initialization and drains it on SIGINT/SIGTERM graceful shutdown. The current Windows development policy is mandatory Thick mode with the configured Instant Client; initialization or mandatory pool failure stops startup with a sanitized diagnostic. Every borrowed connection closes in `finally`. Application services define transaction scope; `withTransaction` commits success and rolls back failure. Dates/timestamps remain ISO-8601 strings at API boundaries, CLOBs are explicitly converted or streamed in repositories, rows use object output, and `NUMBER(19)` IDs are fetched/serialized as strings.

The API and Vite resolve environment configuration from the monorepo root. Nest development mode uses the Nest compiler so decorator metadata required for dependency injection is retained.

Correlation middleware accepts a bounded `X-Correlation-ID` or creates a UUID, exposes it using async-local context, and returns it in the response. JSON technical logs record request completion without bodies, credentials, tokens, or connection strings. Phase 1 supplies a security-audit service boundary and structured infrastructure sink; persistent business-audit storage remains deferred because no approved audit table exists.

Development header authentication is isolated behind the enterprise authentication guard and forbidden in production. It supplies only an identity hint and must resolve an active `SYS_USER`; it never grants code-configured permissions. LDAP mode uses the configured authentication strategy. The confirmed default, `DIRECT_BIND`, tries the submitted, normalized account, UPN, and NetBIOS forms, then performs an escaped exact user search through the successfully authenticated connection to obtain `objectGUID` and configured profile attributes. Optional `SERVICE_SEARCH` first searches with a least-privileged service account and then binds as the discovered user to validate the submitted password. Both strategies resolve the same application-user context, and passwords are never logged or persisted.

`GET /api/v1/auth/me` returns the normalized frontend session: string user/default IDs, identity/display data, active role codes, effective permissions, explicit overrides, resolved scopes, and non-sensitive authentication metadata. Effective permission precedence is explicit DENY -> explicit ALLOW -> active role grant -> default deny. Permission checks, workflow-role eligibility, and data-scope checks remain independent. Reusable permission and data-scope guards keep the API as the authorization boundary and audit denied privileged permission checks.

## Enterprise identity and application authorization

JSAMS authenticates internal users against enterprise Active Directory through LDAP. It has no local password lifecycle. The API receives the password only within the TLS-protected login request, uses it for the user LDAP bind, and then discards it without persistence, hashing, caching, or logging.

```text
Browser
  -> TLS-protected JSAMS login form
  -> API direct LDAP bind using the submitted/account/UPN/NetBIOS candidates
  -> escaped exact user search under the configured base
  -> Active Directory credential decision and attribute response
  -> signed HttpOnly JSAMS session cookie
  -> active SYS_USER resolution
  -> effective permission calculation
  -> data-scope, document-state, workflow-role, assignee, and owner-site checks
  -> allow or deny
```

`SYS_USER` is the internal application authorization representation of the enterprise identity, not a local-login account. Active Directory `objectGUID` is the preferred stable lookup; the canonical enterprise username remains the unique human-recognizable operational identifier. Display name and email are profile attributes and are not authorization keys. Unregistered and inactive application users fail closed, and deactivating `SYS_USER` has no effect on the external Active Directory account.

LDAP connection, search base, authentication strategy, accepted UPN/NetBIOS domain forms, username, identity, display-name, and email attributes are environment-configurable. `DIRECT_BIND` is the confirmed runtime strategy and needs no service-account credentials; `SERVICE_SEARCH` remains an optional strategy for environments that require discovery before the user bind. Filter values are encoded by the LDAP client rather than concatenated into filter strings. Production requires LDAPS or StartTLS with normal certificate verification; the explicitly insecure legacy-certificate compatibility mode is restricted to non-production UAT. Successful authentication issues a short-lived HS256-signed session in an `HttpOnly`, `SameSite=Strict` cookie; production cookies are `Secure`. The cookie contains identity/profile data but never credentials, while each API request reloads the active `SYS_USER` and current authorization assignments. No automatic provisioning, profile synchronization, or AD/HR Role synchronization is claimed.

Application authorization remains a composition of independently governed checks: active application user, role grants, explicit permission overrides, data scope, document state, workflow-role eligibility, current workflow assignee, and owner-site rules. An application role is not an AD group, workflow role is not permission or current assignment, data scope is not implied by role, and `SYSTEM_ADMIN` has no implicit workflow bypass.

### Phase 4.5 User Access Administration boundary

The module registers or maintains the JSAMS representation of an existing enterprise identity; activates or deactivates JSAMS access; manages application Roles and Role Permissions; manages explicit user `ALLOW`/`DENY` overrides; manages Site/Rig/Department scopes; manages workflow-role assignments; previews effective access and approver resolution; blocks changes that would strand pending workflow tasks; and durably audits authorization changes. It does not administer Active Directory or create, modify, change, reset, recover, lock, or unlock directory accounts or passwords.

The Oracle security repository contains all security SQL and returns IDs with `TO_CHAR`. `UserContextService` owns the transaction around application-user and assignment resolution. Data-scope evaluation distinguishes view from action and respects site -> rig -> department hierarchy. No authorization cache is introduced, avoiding stale grants without an invalidation design.

Frontend startup calls `/auth/me`, models loading/authenticated/unauthenticated/unregistered/inactive states, presents the LDAP login page when needed, centralizes permission-aware navigation, and protects direct routes. The password field is cleared after every attempt and credentials are never placed in browser storage. Logout clears the server-issued session cookie. Frontend checks improve navigation only; they never replace backend guards.

The Phase 2 Matrix engine is lookup-based. Display codes such as likelihood `5`, severity `D`, and rating `E` are independent text namespaces; optional numeric fields are metadata and never drive a formula. The API validates full Cartesian completeness before assignment. A never-assigned draft configuration is replaced atomically inside one transaction; any assignment makes that Matrix Version immutable. Per-Rig assignment writes lock the Rig row before checking half-open effective periods, preventing concurrent overlap races. Permission (`SYSTEM_ADMIN`), workflow role, and data scope remain separate; Phase 2 reuses the confirmed administrator permission and enforces Rig action/view scope in the API.

SQL migrations are explicit, checksummed, ordered, and paired with rollback. Migrations 002/003 create and align Phase 1; migration 004 creates Phase 2 master-data/Risk Matrix objects; migration 005 creates the Phase 3 JSA aggregate; migration 006 creates Phase 4 workflow/publication objects and immutability guards; migration 007 adds durable access-administration audit and missing historical workflow identity snapshots; migrations 008/009/010 enforce the confirmed Hazard-Control, Severity, and English-source/no-Job-Type rules. DDL auto-commit limitations are documented in `database/README.md`.

Every Phase 1 table has its own Oracle sequence. Final numeric ranges remain deployment input, so migration 002 does not seed site/range/user data. The controlled bootstrap configures the allowlisted sequences from an approved range. With `LOCAL_SITE_ID` set, startup fails if a sequence has no valid local range, its next value is outside the range, or active ranges for the same sequence code overlap across sites.

Not implemented: translations, annual reviews, reporting, automatic identity provisioning/synchronization, distributed session revocation, GoldenGate deployment topology, external notification delivery, persistent general business-audit storage outside the Phase 4.5 access-audit boundary, and production infrastructure. Production master data, workflow routing, approver assignments, Rig Matrix definitions, mapped attachment roots, and the third-party binary synchronization product remain deployment/configuration inputs rather than invented seed data.

## Phase 3 JSA Draft module

`jsa-draft` owns create, read, personal Draft/Returned retrieval, creator-only edit, aggregate content save, matrix-cell resolution, structured validation, and cancel. Controllers contain no SQL. `JsaDraftService` owns transactions and authorization; `JsaDraftValidationService` owns reusable validation; `JsaNumberService` is the governed numbering boundary; `OracleJsaDraftRepository` owns draft SQL. The personal retrieval query joins only the Master's active Working Version, requires the authenticated user to be its creator, and independently enforces effective `CAN_VIEW` Site/Rig/Department data scope. JSA save resolves each selected immutable library asset version in the exact JSA ownership scope and snapshots its metadata into `JSA_VERSION_ATTACHMENT`.

## Attachment Library and filesystem boundary

`attachment-library` owns governed Site/Rig/Department folders, logical assets, immutable file versions, upload, replacement, exact-version download, and the JSA picker. Administration endpoints require `ATTACHMENT_LIBRARY_ADMIN` plus effective `CAN_ACT`; picker and download require effective `CAN_VIEW`. The JSA picker is constrained to the current JSA's exact ownership scope.

The filesystem adapter writes bytes atomically beneath `ATTACHMENT_STORAGE_ROOT` and stores only a validated relative key. The relative namespace begins with Site/Rig/Department IDs and uses a UUID-backed file name; neither client-supplied paths nor absolute server paths enter Oracle. PDF, supported Office formats, JPG, and PNG are accepted up to 50 MB. SHA-256, file size, content type, original name, status, and immutable version identity are stored in Oracle.

```text
JSAMS Attachment Library
  ├─ Oracle metadata ── GoldenGate ──> remote Oracle metadata
  └─ mapped filesystem ─ third-party sync ─> remote mapped filesystem
```

GoldenGate never transfers binary bytes. The third-party synchronization product is outside the JSAMS runtime boundary. If metadata is present but the exact binary is not yet available, download fails as a storage/synchronization incident; JSAMS must never fall forward to a different file version.

Create accepts only Owner Site, Rig, and Department. The API resolves exactly one active `SYS_LANGUAGE` row with code `EN`, captures it with the effective complete Matrix Version, and inserts JSA Master, first Working Version, and pointer update in one transaction. It fails closed when English configuration is missing or ambiguous. New JSAs do not receive a Job Type. Owner Site, Rig, and Department are immutable after creation because no transfer rule is approved. Draft detail joins the governed organization tables and returns the corresponding codes and names so the worksheet renders ownership as read-only business context instead of editable raw identifiers. Job Title is the only authored General Information text field. Job Description, Permit to Work selection/reference, Location, and Personnel are not accepted by the Draft-header boundary or collected by the worksheet; legacy nullable database columns are left untouched for historical compatibility. Hazard Assessment Prompts are stored as independent version selections; the worksheet and save boundary clear legacy prompt-coverage mappings and neither save nor submission requires a Prompt-to-Hazard/Control link. Procedure References are not presented by the worksheet, are normalized to an empty collection at the save boundary, and do not produce a submission warning; legacy snapshots remain readable as historical data. Initial Likelihood, Initial Severity, and Residual Likelihood use Matrix-backed reference popups; Residual Severity remains a disabled inherited value. Only the creator may edit/cancel in Phase 3; takeover remains disabled. The worksheet saves Header and aggregate Content through one API operation and one Oracle transaction: both row-version checks and all aggregate writes commit together or roll back together. On a root-only stale-version conflict left by an earlier partial save, the worksheet may fetch the latest aggregate and retry once only when the persisted business baseline and child row-version fingerprint prove that no concurrent business edit occurred; genuine conflicts remain blocked and require an explicit reload. Aggregate item references are unique within their entity type, not globally across the aggregate, because each Oracle table owns an independent sequence and valid Task, Hazard, Control, or Basic Step identifiers can overlap. Aggregate saves upsert stable logical entities and soft-deactivate omitted children. Risk snapshots are derived by exact cell lookup against the captured Matrix Version; clients cannot submit rating/result snapshots.

JSA permission-code mapping remains a deployment configuration boundary. All four capabilities must be supplied together and `SYSTEM_ADMIN` is never an implicit JSA capability. Draft creation uses the configured template/sequence only for a Temporary JSA Number. Initial publication allocates the Official JSA Number from the locked `JSA_NUMBER_COUNTER` row for the exact Rig/Department pair, formats `<Rig code>-<Department code>-NNNN`, updates the Master number status, and publishes in the same transaction. The database prevents later mutation of an Official number.

## Phase 4 Approval workflow and publication

`JsaWorkflowModule` is separate from draft authoring. Its service orchestrates permissions, data scope, deterministic route preview, actions, and publication; its Oracle repository owns SQL and transaction-local locks.

Workflow definitions are versioned and contain ordered steps. Bindings may retain nullable Job Type for legacy configuration, but new unclassified JSAs match only bindings whose Job Type is null; Site, Rig, and Department remain available routing dimensions. Resolution orders by specificity then priority and rejects ties. Step assignees come from independent workflow-role assignments; each candidate must also hold the configured approval permission and ACT data scope. Zero or multiple eligible candidates fail closed.

Application permission, workflow role, and data scope remain independent: permission allows an action type, workflow role establishes step eligibility, and data scope controls the records that may be viewed or acted upon.

Rig and Department administration is exposed through the Master Data module under SYSTEM_ADMIN plus effective action data scope. The API validates the active Site/Rig hierarchy, allocates identifiers from the existing governed Oracle sequences, records required security audit evidence, applies optimistic locking, prevents parent moves after creation, and uses deactivate/reactivate rather than delete.

Submit locks and revalidates the Working Version. Return retains the Working Version and workflow instance, requires a reason, and increments the cycle on resubmission. Reject is terminal and preserves the Working Version pointer. Active approval cannot be cancelled.

Final approval performs revalidation, Version publication metadata, Current/Working pointer changes, Master publication, workflow completion, action evidence, and notification/outbox insertion in one Oracle transaction. It refuses initial publication when Current Version is already set. Database triggers reject later mutation of the Published Version aggregate.

Notifications are persisted in-app records with outbox intent. Phase 4 has no dispatcher and makes no email-delivery claim. Non-`ALWAYS` Rig Manager/test conditions fail in production until an approved deterministic rule exists.

## Published JSA HTML printing

`GET /api/v1/jsa-drafts/:id/print` is the operational print-read boundary. It reuses the governed JSA view capability and exact Site/Rig/Department view scope, resolves the Master's current immutable Version, and fails closed unless both Master lifecycle and Version status are `PUBLISHED`. A dedicated print-permission code remains an open business decision and is not invented by this implementation.

The React route `/jsa/:id/print` is authenticated but intentionally outside the application shell. It renders the confirmed PV Drilling JSA form as semantic HTML, loads governed content through Basic Job Step from the exact Published Version, retains selected Prompt snapshots that no longer exist in the current catalogue, and renders the `PERSONAL INVOLVED` and Work Leader Debrief sections as static blank form layout. `window.print()` hands PDF generation to the browser; the API does not generate, store, or synchronize a PDF binary. Print CSS supplies A4 landscape defaults, exact risk/background colors, repeated Task-table headers, controlled page breaks, and print-only removal of navigation/actions.
