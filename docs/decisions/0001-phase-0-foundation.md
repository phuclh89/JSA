# ADR 0001: Phase 0 foundation

Status: Accepted for Phase 0.

Use a pnpm TypeScript monorepo, React/Vite frontend, NestJS modular-monolith backend, direct node-oracledb infrastructure, and explicit checksummed SQL migrations. This keeps application and database changes inspectable while business requirements remain unknown. Production topology and integrations remain open decisions.
