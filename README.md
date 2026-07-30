# JSAMS

Job Safety Analysis Management System. Phases 0–4.5 provide Oracle/site security, governed master data and Rig-specific Risk Matrices, one-screen JSA authoring, approval workflow, immutable initial publishing, and governed User Access Administration. Translation, annual review, and reporting remain future phases.

## Prerequisites

- Node.js 20 or 22 LTS
- pnpm 9 (`corepack enable`, then `corepack prepare pnpm@9.15.5 --activate`)
- Oracle Database 19c-compatible instance and credentials

## Local setup

1. Copy `.env.example` to `.env` and supply the three required `ORACLE_*` values. Never commit `.env`.
2. Run `pnpm install --frozen-lockfile` (use `pnpm install` before the first lockfile exists).
3. Run `pnpm db:up` to apply the schema migrations.
4. After approved site/range/admin values are available, run the documented one-time `pnpm db:bootstrap:phase1` and set `LOCAL_SITE_ID` to its returned site ID.
5. Run `pnpm db:bootstrap:phase2` with an approved `PHASE2_BOOTSTRAP_ACTOR` to configure Phase 2 sequences; this adds no business seed data.
6. Run `pnpm db:bootstrap:phase4` with the approved Phase 4 actor after migration 006.
7. Run `pnpm db:bootstrap:phase45` with `LOCAL_SITE_ID` and an approved `PHASE45_BOOTSTRAP_ACTOR` after migration 007. This configures only the access-audit sequence.
8. Configure `ATTACHMENT_STORAGE_ROOT`, then run `pnpm db:bootstrap:attachments` with `LOCAL_SITE_ID` and an approved `ATTACHMENT_BOOTSTRAP_ACTOR` after migration 012.
9. When the approved LDAP administrator is `phuclh`, run the idempotent `pnpm db:seed:ldap-admin`.
10. For development/UAT only, run `pnpm db:seed:uat-full-approval` to give the configured test user all active permissions and the complete four-step approval path.
11. Run `pnpm dev`, or run `start-jsams.cmd` on Windows to open the API on port 3000 and the frontend on port 5173 in separate command windows.
12. Open `http://localhost:5173`; API Swagger is at `http://localhost:3000/docs`.

The API validates configuration before startup and opens one Oracle pool. Development authentication uses `X-Dev-User` only as an enterprise-identity hint; it must resolve an active `SYS_USER` and is rejected in production. LDAP mode validates the submitted enterprise credentials against internal Active Directory, creates a signed HttpOnly JSAMS session, and resolves the existing active application user plus its independent roles, permissions, overrides, scopes, and workflow assignments. LDAP authentication alone does not grant application access. JSAMS receives the password only during login and never stores, hashes, caches, or logs it. See [deployment](docs/deployment.md) and [database guide](database/README.md).

## Real Oracle development setup

Create an ignored root `.env` with the local secret and the development target:

```dotenv
ORACLE_CLIENT_MODE=thick
ORACLE_USER=JSA_APP
ORACLE_PASSWORD=<LOCAL_SECRET>
ORACLE_CONNECT_STRING=172.16.10.186:1521/PDBAPPS
ORACLE_CLIENT_LIB_DIR=C:/Users/phuclh/AppData/Local/Microsoft/WinGet/Packages/Oracle.InstantClient.Basic_Microsoft.Winget.Source_8wekyb3d8bbwe/instantclient_23_9
```

`PDBAPPS` is a service name, not a SID. Thick mode loads the installed Instant Client before any pool or connection; Thin mode remains supported for other explicitly configured environments. Run:

```text
corepack pnpm oracle:diagnose
corepack pnpm db:status
corepack pnpm db:up
corepack pnpm db:down
corepack pnpm dev
```

Health URLs are `http://localhost:3000/api/v1/health`, `/health/live`, and `/health/ready`. Rollback is development/test-only and requires `CONFIRM_DEVELOPMENT_ROLLBACK=YES`; migration 001 rollback deletes the history table itself.

Common diagnostics: `DPI-1047` means client DLL loading failed; `ORA-01017` invalid credentials; `ORA-12154` unresolved connect identifier; `ORA-12514` unknown service; `ORA-12541` no listener; `ORA-12545` unreachable host; `ORA-28000` locked account; `ORA-28001` expired password. Do not paste secrets into troubleshooting output.

## Quality commands

`pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` run across the workspace.

Database verification commands include `pnpm db:verify`, `pnpm db:verify:phase2`, `pnpm db:verify:phase3`, `pnpm db:verify:phase4`, and `pnpm db:verify:phase45`. See [database schema](docs/database-schema.md) for the model and [deployment](docs/deployment.md) for the no-seed configuration policy.

## Phase 3 JSA Draft

Phase 3 adds `/jsa/new` and `/jsa/:jsaId/draft`, backed by `/api/v1/jsa-drafts`. The editor covers General information, one-click Hazard Assessment Prompts, Task → Hazard → Control analysis, initial/residual Matrix lookup, Basic Job Steps with multiple positions/tools, governed Attachment Library selection, structured validation, optimistic conflicts, unsaved changes, read-only state, and cancellation. Phase 4 enables its Save & Submit control.

JSA permissions, numbering, and mapped attachment storage are fail-closed deployment inputs; see `.env.example` and `docs/deployment.md`. Attachment binaries are stored outside Oracle and synchronized between sites by an approved third-party product; GoldenGate replicates metadata only. Phase 3 Oracle behavior verification is `pnpm db:verify:phase3`.

## Phase 4 Approval Workflow

Phase 4 adds governed, versioned approval configuration and initial publishing:

- deterministic bindings by Site, Rig, Department, and Job Type;
- independent workflow-role, application-permission, and data-scope checks;
- Creator submission through Department Head, STC, OIM, and a conditionally configured Rig Manager step;
- approve, required-reason return/reject, comment, same-instance resubmission, and immutable initial publication;
- Needs Approval, Pending Approval, Rejected, Published, workflow review/history, notification, and workflow administration screens.

Production remains fail-closed until all seven workflow permission mappings, active definitions/bindings, role assignments, and data scopes are governed. No external email delivery is claimed.

## Phase 4.5 User Access Administration

All `/api/v1/access-administration/*` routes and matching `/operations/access/*` screens require effective `SYSTEM_ADMIN`; this permission never grants JSA approval. Administrators can register existing enterprise identities, govern application Roles and existing Permissions, user Roles, explicit ALLOW/DENY overrides, Site/Rig/Department scopes, and workflow-role assignments, and inspect effective access, approver resolution, UAT readiness, pending-task impact, and immutable access audit history.

LDAP connection, bind strategy, accepted domain forms, and attribute mappings are explicit environment configuration. The confirmed runtime strategy is Direct Bind; service-account search remains an optional deployment strategy. Active Directory `objectGUID` is the preferred stable identity key; username fallback is only a controlled migration aid. JSAMS stores no enterprise password, does not provision or administer AD accounts, and does not implement impersonation.
