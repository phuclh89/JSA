# JSAMS

Job Safety Analysis Management System. Phase 1 provides the Oracle site/security schema, enterprise application-user resolution, RBAC and data-scope foundations, and the permission-aware application shell. JSA authoring, workflow, risk-matrix, translation, review, and reporting features are not implemented yet.

## Prerequisites

- Node.js 20 or 22 LTS
- pnpm 9 (`corepack enable`, then `corepack prepare pnpm@9.15.5 --activate`)
- Oracle Database 19c-compatible instance and credentials

## Local setup

1. Copy `.env.example` to `.env` and supply the three required `ORACLE_*` values. Never commit `.env`.
2. Run `pnpm install --frozen-lockfile` (use `pnpm install` before the first lockfile exists).
3. Run `pnpm db:up` to apply the schema migrations.
4. After approved site/range/admin values are available, run the documented one-time `pnpm db:bootstrap:phase1` and set `LOCAL_SITE_ID` to its returned site ID.
5. Run `pnpm dev`.
6. Open `http://localhost:5173`; API Swagger is at `http://localhost:3000/docs`.

The API validates configuration before startup and opens one Oracle pool. Development authentication uses `X-Dev-User` only as an enterprise-identity hint; it must resolve an active `SYS_USER` and is rejected in production. OIDC validates signed enterprise tokens when enabled. See [deployment](docs/deployment.md) and [database guide](database/README.md).

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
