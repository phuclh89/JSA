# JSAMS

Job Safety Analysis Management System — Phase 0 technical foundation. This repository intentionally contains no JSA business workflows or business schema.

## Prerequisites

- Node.js 20 or 22 LTS
- pnpm 9 (`corepack enable`, then `corepack prepare pnpm@9.15.5 --activate`)
- Oracle Database 19c-compatible instance and credentials

## Local setup

1. Copy `.env.example` to `.env` and supply the three required `ORACLE_*` values. Never commit `.env`.
2. Run `pnpm install --frozen-lockfile` (use `pnpm install` before the first lockfile exists).
3. Run `pnpm db:up` to initialize migration history.
4. Run `pnpm dev`.
5. Open `http://localhost:5173`; API Swagger is at `http://localhost:3000/docs`.

The API validates configuration before startup and opens one Oracle pool. Development authentication uses `X-Dev-User: admin` and is rejected in production. See [deployment](docs/deployment.md) and [database guide](database/README.md).

## Quality commands

`pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` run across the workspace.
