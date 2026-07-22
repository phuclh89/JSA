# Deployment and operations

CI validates source only and never migrates a database. Database promotion is a separate controlled operation using environment-injected secrets. Production infrastructure is not defined in Phase 0.

At runtime, provide every variable listed in `.env.example`. The API fails fast for missing Oracle credentials, invalid pool settings, incomplete enabled OIDC settings, or development auth in production. Termination signals trigger Nest shutdown hooks and close the pool. Expose `/api/v1/health/live` for liveness and `/api/v1/health/ready` for readiness; readiness returns 503 when Oracle is down.

Do not log or bake secrets into images. Use the platform secret store when one is selected. Thin mode is the safe local default; the thick/thin production choice remains open.
