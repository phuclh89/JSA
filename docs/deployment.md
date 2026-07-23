# Deployment and operations

CI validates source only and never migrates a database. Database promotion is a separate controlled operation using environment-injected secrets. Production infrastructure is not yet defined.

At runtime, provide every applicable variable listed in `.env.example`. The API fails fast for missing Oracle credentials, invalid pool settings, incomplete enabled OIDC settings, OIDC mode without `OIDC_ENABLED=true`, or development auth in production. Termination signals trigger Nest shutdown hooks and close the pool. Expose `/api/v1/health/live` for liveness and `/api/v1/health/ready` for readiness; readiness returns 503 when Oracle is down.

Do not log or bake secrets into images. Use the platform secret store when one is selected. The current Windows development environment uses Thick mode and must initialize Instant Client before pool creation. Thin versus Thick production mode remains open. Production migration credentials should be separated from runtime credentials and database deployment remains a controlled step.

The Phase 0A database is Oracle 23.0.0.0.0 with schema `JSA_APP`; this is a development verification target only. Runtime and migration accounts should be separated before production.

## Phase 1 site and security bootstrap

Migration 002 creates schema objects only. It intentionally does not invent final site IDs, numeric ranges, or enterprise identities. Before the first operational login, an authorized deployment owner must provide:

- `BOOTSTRAP_SITE_CODE`, `BOOTSTRAP_SITE_NAME`, and `BOOTSTRAP_SITE_TIMEZONE`;
- approved non-overlapping `BOOTSTRAP_SEQUENCE_RANGE_START` and `BOOTSTRAP_SEQUENCE_RANGE_END`;
- stable `BOOTSTRAP_ADMIN_IDENTITY_KEY`, username, display name, and optional email.

Run `pnpm db:bootstrap:phase1` once against the confirmed local schema. The command refuses an existing site, invalid/undersized/overlapping ranges, missing values, and non-decimal `NUMBER(19)` values. It configures the allowlisted Phase 1 sequences and creates only the confirmed `SYSTEM_HEALTH_VIEW` and `SYSTEM_ADMIN` permissions, administrator role/mapping, and site scope. No password is stored.

Capture the returned site ID as a decimal string, set it as `LOCAL_SITE_ID`, and restart. Startup then validates every Phase 1 sequence against the local active range and rejects overlaps or out-of-range next values. Do not set `LOCAL_SITE_ID` before governed range configuration exists. Never run bootstrap with placeholder values in production.

Development uses `X-Dev-User` only when `AUTH_MODE=development`; the value must map to an active `SYS_USER`. Production requires `AUTH_MODE=oidc`, `OIDC_ENABLED=true`, tenant/client/audience values, and TLS. The browser does not persist provider tokens in local or session storage.

## Phase 2 sequence bootstrap and business configuration

Migration 004 creates Phase 2 schema objects only and never seeds production master data or Risk Matrices. After the Phase 1 bootstrap has established an approved Site and non-overlapping range, set `LOCAL_SITE_ID` and `PHASE2_BOOTSTRAP_ACTOR`, then run `pnpm db:bootstrap:phase2`. The command verifies the local Site/range and configures only the 15 allowlisted Phase 2 sequences. It refuses missing or ambiguous active ranges and does not create catalogues, Matrix definitions, versions, cells, or Rig assignments.

An authorized business/configuration owner must subsequently supply the real catalogue values and each Rig's approved 3×3 or 5×5 Matrix through the administration API/UI. Validate every Matrix Version before assignment. Do not promote test fixture codes or inferred formulas as production configuration. Effective-dated assignment changes require a reason and the administrator must have action scope for the target Rig.

## Phase 3 sequence, permission, and numbering configuration

After migration 005 and an approved Phase 1 Site/range exist, set `LOCAL_SITE_ID` and `PHASE3_BOOTSTRAP_ACTOR`, then run `pnpm db:bootstrap:phase3`. It configures only the 14 Phase 3 sequences and inserts no JSA, permission, numbering, or reference data. It fails closed for a missing/ambiguous range or partial prior configuration.

Before enabling JSA routes, approve and create four permission codes and map them through `JSA_PERMISSION_VIEW`, `JSA_PERMISSION_CREATE`, `JSA_PERMISSION_EDIT`, and `JSA_PERMISSION_CANCEL`. Set all four or none; `SYSTEM_ADMIN` is not a substitute. Also approve `JSA_NUMBER_TEMPLATE` (must contain `{sequence}`; `{siteId}` is optional) and `JSA_NUMBER_UNIQUENESS_SCOPE` (`GLOBAL` or `SITE`). Missing values intentionally make associated mutations unavailable.

Attachment metadata is supported, but binary storage is not. Do not advertise upload until an approved adapter implements the attachment storage port.
## Phase 4 workflow configuration

Configure all seven mappings together: `JSA_PERMISSION_SUBMIT`, `JSA_PERMISSION_APPROVE`, `JSA_PERMISSION_RETURN`, `JSA_PERMISSION_REJECT`, `JSA_PERMISSION_COMMENT`, `JSA_PERMISSION_WORKFLOW_VIEW`, and `JSA_PERMISSION_WORKFLOW_ADMIN`. Partial mapping is rejected and production requires the complete set.

After migration 006, run `db:bootstrap:phase4` with approved `LOCAL_SITE_ID` and `PHASE4_BOOTSTRAP_ACTOR`. Then govern permission grants, definitions, steps, bindings, and workflow-role assignments. Migration/bootstrap intentionally seed none of those business values.

Every effective step must resolve exactly one active user with independent approve permission and ACT scope. Ambiguous bindings, zero/multiple assignees, partial permissions, and unapproved production conditions stop processing. The optional Rig Manager condition remains open.

`SYS_NOTIFICATION_OUTBOX` is delivery intent only; no Phase 4 email worker exists. Development rollback drops Phase 4 triggers/procedure, tables, Site sequence-range rows, and sequences, then restores Phase 3 status constraints.
