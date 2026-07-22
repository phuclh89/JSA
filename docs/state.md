# Project state

## Phase 0 scope and status

The technical foundation is implemented: pnpm monorepo, React shell, NestJS API, typed configuration, Oracle pool/executor, health checks, correlation/logging, standardized errors, authentication/permission abstractions, SQL migration tooling, tests, CI, and documentation. Local install, type-check, lint, unit tests, builds, API smoke, and frontend smoke pass. No JSA business functionality or tables exist.

Verification status is recorded truthfully in `testing-log.md`. Real Oracle connectivity and executing migration/rollback against Oracle remain unverified because credentials and an accessible instance were not provided; Phase 0 therefore does not yet meet every acceptance criterion.

## Deferred

All JSA workflows and master data; production OIDC; GoldenGate configuration; email/notifications; attachments; production hosting/deployment; business audit storage.

## Constraints

Oracle 19c compatibility, bind-only values, string API IDs for `NUMBER(19)`, explicit sequence-based keys, immutable explicit migrations, one application pool, and backend authorization are mandatory.

## Open decisions

Oracle thick versus thin mode, actual production Oracle version, identity mapping, site identifiers and sequence ranges, GoldenGate topology, attachment/notification providers, hosting, and RPO/RTO remain undecided.
