# ADR-003: Effective permission override precedence

## Status

Accepted for Phase 1.

## Context

JSAMS permissions can be granted through active roles and adjusted for an individual application user. The evaluator must be deterministic and fail closed when no grant exists. Application roles remain separate from workflow-role eligibility and data scope.

## Decision

Resolve each active permission in this order:

1. explicit active user `DENY`;
2. explicit active user `ALLOW`;
3. grant from an active role through an active role-permission assignment and active permission;
4. default deny.

Inactive users, roles, permissions, assignments, overrides, and expired overrides contribute no access. Permission evaluation does not imply any data scope; both checks must pass independently.

## Consequences

The database stores `ALLOW` and `DENY` explicitly and prevents more than one active override for the same user and permission. The reusable evaluator removes role grants for explicit denies and never infers permissions from role names in the frontend or backend.
