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

## Phase 3 migration and verification

Migration `005_create_jsa_draft_core.sql` creates the 13-table JSA Draft/version aggregate and 14 explicit sequences. Its rollback removes Phase 3 range registrations, drops cross-pointer constraints, then drops children, versions, Master, and sequences in dependency order. It does not touch Phase 1/2 business objects.

`pnpm db:verify:phase3` builds a disposable hierarchy, 5×5 mixed-code Matrix, Draft Master/Version, Task/Hazard/Control, and cancellation state inside one Oracle transaction. It verifies pointer semantics, stable logical keys, exact `5`/`D` → `E`/`EXTREME` snapshots, prohibited residual storage, and cancellation, then rolls back. `pnpm db:bootstrap:phase3` configures only the new sequence ranges after an approved `LOCAL_SITE_ID` exists.
## Phase 4 migration and verification

`006_create_approval_workflow.sql` creates versioned workflow configuration/bindings, independent workflow-role assignments, instances/tasks/actions, notification/outbox persistence, publication metadata, Published immutability triggers, and nine explicit sequences.

Run `corepack pnpm --dir database run bootstrap:phase4` only with approved `LOCAL_SITE_ID` and `PHASE4_BOOTSTRAP_ACTOR`. It rejects partial configuration and never invents workflow/business values.

`corepack pnpm --dir database run verify:phase4` uses a rolled-back Oracle fixture to verify unique assignee resolution, Return/Resubmit on one instance, approval progression, atomic initial publication, and Published immutability.
