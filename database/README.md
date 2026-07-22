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
