# Oracle database changes

SQL migrations are explicit, immutable, and Oracle 19c-compatible. Each `migrations/NNN_name.sql` file requires a matching `rollback/NNN_rollback_name.sql`. Run `pnpm db:status`, `pnpm db:up`, or `pnpm db:down` from the repository root.

The runner orders numeric prefixes, hashes each file with SHA-256, skips matching applied migrations, and stops when an applied checksum differs. SQL and metadata values use bind variables wherever values can be bound. Oracle does not support transactional DDL: DDL implicitly commits before and after execution, so a multi-statement migration can be partly applied when it fails. Rollbacks are controlled compensating scripts, not atomic reversal. Migration 001 drops its own history table during rollback, so that rollback cannot retain its own status row.

Migration file convention:

- Ordinary SQL statements end with `;`.
- PL/SQL blocks retain internal semicolons and end with `/` on its own line.
- `/` may also separate ordinary statements. Empty segments and Windows line endings are accepted.
- Comments are preserved for Oracle. This runner is intentionally not a general-purpose SQL parser; use the documented delimiters.

Production rollback is disabled. Development rollback requires `CONFIRM_DEVELOPMENT_ROLLBACK=YES` and runtime confirmation that session user/schema match `ORACLE_USER`, the service matches `ORACLE_CONNECT_STRING`, and migration constraints match JSAMS ownership markers. Migration 001 rollback drops `JSA_SCHEMA_VERSION`, cannot retain a `ROLLED_BACK` row, and is development/test-only. Credentials and connection strings are never printed.

Use separate migration-owner and runtime credentials in future environments. Phase 0A used `JSA_APP` for both only for controlled development verification. The example under `setup/` requires DBA review and is never executed by application tooling.

## Phase 1 migration and bootstrap

Migration `002_create_security_foundation.sql` creates 11 `SYS_*` tables, one sequence per table, named constraints, foreign-key/authorization indexes, and active-assignment unique indexes. Migration 003 aligns those final unique-index names to the repository `IX_*` convention without editing applied migration 002. Their rollbacks remove or reverse only the corresponding Phase 1 objects and leave `JSA_SCHEMA_VERSION` intact.

`pnpm db:verify` validates migration 001, Phase 1 migrations 002/003, table/sequence presence, final unique-index names, migration status, and `NUMBER(19)` primary-key metadata. `pnpm db:down` rolls back only the latest applied migration and retains the controlled development safety checks.

No Phase 1 seed is embedded in the migration because final site identities/ranges and administrator identity are environment-specific open inputs. After those values are approved, `pnpm db:bootstrap:phase1` performs the one-time configuration described in `docs/deployment.md`. It uses bind variables for data and dynamic DDL only for an internal allowlist of known sequence names plus a validated decimal range start. Oracle sequences remain the only ID generators; `SYS_SITE_SEQUENCE_RANGE` has no current-value column.

## Phase 2 migration and verification

Migration `004_create_master_data_risk_matrix.sql` creates 8 master-data tables, 7 Risk Matrix/assignment tables, and one sequence per table. Its rollback removes only those Phase 2 objects in child-first order. It contains no seed data.

Run `pnpm db:verify` for metadata and `pnpm db:verify:phase2` for transactional constraint behavior. The Phase 2 verifier inserts a test-only mixed-code 5×5 configuration, proves the configured `5`/`D` lookup, scoped uniqueness, hierarchy/Tool Category constraints, duplicate-cell rejection, and overlap lookup, then always rolls back. It must never be treated as production configuration.

After an approved Phase 1 Site/range exists, `pnpm db:bootstrap:phase2` positions only the internal Phase 2 sequence allowlist inside that range. Required values are `LOCAL_SITE_ID` and `PHASE2_BOOTSTRAP_ACTOR`; the command adds no business rows.

The environment-specific `pnpm db:seed:legacy-risk-matrix` command creates the confirmed PV Drilling 5x5 data as a new immutable Matrix Version and effective-ends the prior Rig assignment instead of rewriting it. It defaults to `DEV-5X5 / PVDRILLING-V2`, the Matrix's currently assigned Rig, and actor `phuclh`; deployments may explicitly set `RISK_MATRIX_SEED_CODE`, `RISK_MATRIX_SEED_VERSION`, `RISK_MATRIX_SEED_RIG_ID`, and `RISK_MATRIX_SEED_ACTOR`. Verify the exact terminology, Risk Colour guidance, active Rig assignment, and all 25 cells with `pnpm db:verify:legacy-risk-matrix`.

`pnpm db:seed:legacy-hazard-prompts` idempotently creates or aligns the confirmed 25 Hazard Assessment Prompts at Rig scope, using `HAZARD_PROMPT_SEED_RIG_ID` when more than one active Rig exists and `HAZARD_PROMPT_SEED_ACTOR` for the audit actor. It soft-deactivates only the three superseded development fixtures (`ENERGY`, `DROPPED`, and `PINCH`). Run `pnpm db:verify:legacy-hazard-prompts` to check the exact labels, display order, target Rig, and effective 25-item count.

## Phase 3 migration and verification

Migration `005_create_jsa_draft_core.sql` creates the 13-table JSA Draft/version aggregate and 14 explicit sequences. Its rollback removes Phase 3 range registrations, drops cross-pointer constraints, then drops children, versions, Master, and sequences in dependency order. It does not touch Phase 1/2 business objects.

`pnpm db:verify:phase3` builds a disposable hierarchy, 5×5 mixed-code Matrix, Draft Master/Version, Task/Hazard/Control, and cancellation state inside one Oracle transaction. It verifies pointer semantics, stable logical keys, exact `5`/`D` → `E`/`EXTREME` snapshots, prohibited residual storage, and cancellation, then rolls back. `pnpm db:bootstrap:phase3` configures only the new sequence ranges after an approved `LOCAL_SITE_ID` exists.

Migration 008 enforces the confirmed Hazard-Control 1:1 correction. It fails closed when legacy data contains multiple active Controls for one Hazard, then creates a function-based unique index that permits at most one active Control per Hazard. Application structural and submission validation require exactly one. Its rollback removes only that index.

Migration 009 enforces the confirmed risk-assessment rule that Residual Severity equals Initial Severity for each Hazard. It fails closed if legacy rows differ, then adds `CHK_JSA_HAZ_RES_SEV_MATCH`; both severities may be null while a Draft is incomplete, but they cannot be populated independently or hold different values. Its rollback removes only that check constraint.

Migration 010 removes Job Type as a mandatory source-JSA classification and makes source language mandatory English. It requires exactly one active `SYS_LANGUAGE` row with code `EN`, rejects existing non-English source versions, backfills only missing language values, makes `JOB_TYPE_ID` nullable and `LANGUAGE_ID` non-null, and installs `TRG_JSA_VERSION_ENGLISH`. Historical Job Type values are not rewritten. Rollback fails closed once any JSA Version without Job Type exists because restoring the former non-null constraint would otherwise be unsafe.

Migration 011 separates Temporary Draft/approval identifiers from Official JSA numbers. It adds `JSA_MASTER.NUMBER_STATUS`, creates the concurrency-safe `JSA_NUMBER_COUNTER` keyed by Rig/Department, constrains the counter to `0001`–`9999`, and installs `TRG_JSA_OFFICIAL_NUM_IMMUTABLE`. Final approval locks and increments the exact pair counter and publishes `<Rig code>-<Department code>-NNNN` in the same transaction. Rollback removes only the counter, trigger, and number-status column; it does not rewrite `JSA_NUMBER`.

## Phase 4 migration and verification

`006_create_approval_workflow.sql` creates versioned workflow configuration/bindings, independent workflow-role assignments, instances/tasks/actions, notification/outbox persistence, publication metadata, Published immutability triggers, and nine explicit sequences.

Run `corepack pnpm --dir database run bootstrap:phase4` only with approved `LOCAL_SITE_ID` and `PHASE4_BOOTSTRAP_ACTOR`. It rejects partial configuration and never invents workflow/business values.

`corepack pnpm --dir database run verify:phase4` uses a rolled-back Oracle fixture to verify unique assignee resolution, Return/Resubmit on one instance, approval progression, atomic initial publication, and Published immutability.

## Phase 4.5 migration and verification

`007_create_access_administration.sql` adds append-only `SYS_ACCESS_ADMIN_AUDIT`, `SEQ_SYS_ACCESS_ADMIN_AUDIT`, four audit indexes, and `TRG_SYS_ACCESS_AUDIT_IMMUTABLE`. It also adds task snapshots for workflow step/role and assignee username/display name, plus action snapshots for workflow step/role and actor display name. Existing task/action rows are backfilled; completed evidence is not rewritten by later profile or assignment changes.

Run `pnpm db:bootstrap:phase45` only with approved `LOCAL_SITE_ID` and `PHASE45_BOOTSTRAP_ACTOR`. It registers and positions only the new audit sequence inside the existing Site range and seeds no user, Role, Permission, scope, workflow assignment, definition, or identity. `pnpm db:verify:phase45` checks migration state, non-null historical snapshots, pending-task snapshot consistency, and the immutable audit trigger.

The rollback removes only migration 007 additions and the audit sequence range. Oracle DDL is non-transactional, so a failed partial apply must be reviewed and compensated with the matching rollback before reapply.

## LDAP administrator seed

After LDAP and Phase 4.5 configuration are available, `pnpm db:seed:ldap-admin` performs an idempotent, environment-specific administrator seed. `SEED_LDAP_ADMIN_USERNAME` defaults to `phuclh`; the script resolves the exact directory user and `objectGUID`, uses `LOCAL_SITE_ID` or the only active Site, creates or aligns the active `SYS_USER`, assigns the existing active `SYSTEM_ADMIN` Role, grants active Site `VIEW/ACT` scope, and writes immutable access-administration audit events. It never creates a Site, Role, Permission, or password record and never prints LDAP/Oracle credentials.

## Development/UAT full-approval seed

`pnpm db:seed:uat-full-approval` is an explicit non-production fixture for single-user workflow testing. It defaults `SEED_UAT_APPROVER_USERNAME` to `phuclh`, requires the existing active user, `SYSTEM_ADMIN` Role, Site `VIEW/ACT`, migration 007, and configured Site sequence ranges. It creates the seven `DEV_*` Phase 4 permissions when absent, grants every active Permission to `SYSTEM_ADMIN`, creates one active site-wide four-step workflow and binding, assigns all four approver workflow Roles to the target user, and writes one immutable audit event. A second run returns `SKIPPED`; production is rejected. Verify with `pnpm db:verify:uat-full-approval`.

## Development own-JSA cleanup

`pnpm db:cleanup:own-test-jsas` deletes only the JSA aggregate, workflow runtime rows, and JSA-targeted notifications belonging to `JSA_CLEANUP_USERNAME` (default `phuclh`). It preserves other users' JSAs and all users, authorization, organization, Matrix, workflow configuration, numbering configuration, and Attachment Library records. The script is forbidden in production, refuses any target containing a Published Version, requires `CONFIRM_OWN_JSA_CLEANUP` to equal the target username, and commits all deletions atomically.

## Attachment Library migration and bootstrap

Migration 012 creates the governed folder, logical asset, and immutable asset-version metadata model and links exact file versions to `JSA_VERSION_ATTACHMENT`. File bytes remain outside Oracle.

After applying migration 012, set `LOCAL_SITE_ID` and `ATTACHMENT_BOOTSTRAP_ACTOR`, then run `pnpm db:bootstrap:attachments`. The command is idempotent, configures only the three attachment sequences from the site's existing approved range, and refuses partial configuration. `pnpm db:verify` includes the migration, tables, sequences, and JSA snapshot-link columns.
