# ADR-002: Oracle client mode for Windows development

## Context

The Phase 0A development target requires features and compatibility supplied by Oracle Instant Client 23.9 on Windows.

## Decision

Use node-oracledb Thick mode for the current Windows development environment. `ORACLE_CLIENT_MODE=thick` requires `ORACLE_CLIENT_LIB_DIR`; the application calls `initOracleClient` exactly once before any pool or connection. Initialization failure stops startup and never falls back silently.

## Consequences

The Instant Client Basic package, `oci.dll`, compatible Node.js/OS architecture, and dependent DLLs must be present. Diagnostic output may show the non-secret library path but never credentials. Thin mode remains a supported explicit option for future environments.

## Review conditions

Review when production hosting, Oracle version, container image, network encryption, wallet, or authentication requirements are known.
