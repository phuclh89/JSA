# Oracle database changes

SQL migrations are explicit, immutable, and Oracle 19c-compatible. Each `migrations/NNN_name.sql` file requires a matching `rollback/NNN_rollback_name.sql`. Run `pnpm db:status`, `pnpm db:up`, or `pnpm db:down` from the repository root.

The runner orders numeric prefixes, hashes each file with SHA-256, skips matching applied migrations, and stops when an applied checksum differs. SQL and metadata values use bind variables wherever values can be bound. Oracle does not support transactional DDL: DDL implicitly commits before and after execution, so a multi-statement migration can be partly applied when it fails. Rollbacks are controlled compensating scripts, not atomic reversal. Migration 001 drops its own history table during rollback, so that rollback cannot retain its own status row.

Production rollback is never automatic. A direct production down command additionally requires `CONFIRM_PRODUCTION_ROLLBACK=YES`. Credentials and connection strings are never printed.
