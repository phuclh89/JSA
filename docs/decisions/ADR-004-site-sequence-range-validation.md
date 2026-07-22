# ADR-004: Site sequence range bootstrap and validation

## Status

Accepted for Phase 1.

## Context

GoldenGate must preserve identifiers while independently operating sites generate identifiers without collisions. Final site identifiers and numeric ranges are not yet confirmed, so migrations cannot safely seed them.

## Decision

Create one Oracle sequence per Phase 1 table and keep `SYS_SITE_SEQUENCE_RANGE` as governed metadata only; it is never a manually updated current-value generator. Environment-specific bootstrap must receive an approved site identity and non-overlapping range, configure the allowlisted sequences, and create the initial site, administrator mapping, minimal confirmed permissions, role, and site scope with bind variables.

When `LOCAL_SITE_ID` is configured, application startup validates that active ranges do not overlap for the same sequence code across sites and that every Phase 1 sequence has an active local range containing its next allocated value. Startup fails closed on missing, overlapping, or exhausted configuration. Until an approved range is configured, no bootstrap or generated Phase 1 business identifier is permitted.

## Consequences

Migration 002 contains no environment identity, site ID, range, or personal account. GoldenGate copies PK/FK values unchanged and never synchronizes sequence state. Deployment owns range approval and must set `LOCAL_SITE_ID` to the bootstrap result before operational use.
