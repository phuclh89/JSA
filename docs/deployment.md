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
