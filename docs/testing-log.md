# Testing log

## Phase 0 — 2026-07-22

| Check | Exact command | Result |
|---|---|---|
| Install | `corepack pnpm install` | PASS; lockfile generated, all 7 workspace projects installed |
| Format | `corepack pnpm exec prettier --write .` | PASS |
| Type-check | `corepack pnpm typecheck` | PASS; API, web, database, and shared packages |
| Lint | `corepack pnpm lint` | PASS; zero warnings allowed |
| Unit tests | `corepack pnpm test` | PASS; API 17, web 9, migration 7 |
| Backend build | `corepack pnpm --filter @jsams/api build` (also included in `corepack pnpm build`) | PASS |
| Frontend build | `corepack pnpm --filter @jsams/web build` (also included in `corepack pnpm build`) | PASS; Vite reports a non-failing 753.55 kB chunk-size warning |
| Full build | `corepack pnpm build` | PASS |
| Backend smoke | `node apps/api/dist/main.js` with temporary development env, `ORACLE_POOL_MIN=0`, and unreachable test connect string; request `GET http://127.0.0.1:3100/api/v1/health/live` | PASS; process started, pool opened, HTTP 200, correlation ID logged |
| Readiness failure smoke | `GET http://127.0.0.1:3100/api/v1/health/ready` with unreachable test Oracle endpoint | PASS; HTTP 503 and internal `NJS-503` log with correlation ID; no connection details returned by API |
| Frontend smoke | `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174` from `apps/web`, then `GET http://127.0.0.1:5174` | PASS; HTTP 200 and root mount element present |
| Real Oracle connectivity | `corepack pnpm db:status` / API readiness with real credentials | NOT RUN; no `ORACLE_USER`, `ORACLE_PASSWORD`, or `ORACLE_CONNECT_STRING` was supplied |
| Migration behavior (mocked Oracle) | Included in `corepack pnpm test` | PASS; first apply, repeat skip, checksum rejection, failure propagation, status bind, SQL order, and controlled rollback |
| Real migration up/status | `corepack pnpm db:up` and `corepack pnpm db:status` | NOT RUN; no accessible development Oracle instance/credentials |
| Real rollback | `corepack pnpm db:down` | NOT RUN; no accessible development Oracle instance/credentials and therefore no Phase 0 migration was applied |

Mocked Oracle tests verify commit, rollback, connection release, pool shutdown, readiness success/failure, and migration control flow. They do not constitute a real Oracle integration result.
