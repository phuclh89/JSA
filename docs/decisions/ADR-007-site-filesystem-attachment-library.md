# ADR-007: Site filesystem attachment library and metadata replication

## Status

Accepted on 2026-07-29.

## Context

JSAMS needs governed reusable attachments organized by Site, Rig, and Department. Oracle is the business metadata authority, but storing file binaries in Oracle would make database replication and operational storage unnecessarily coupled. Each site can provide a real local or mapped filesystem location, and an approved third-party product will synchronize those binaries between sites.

Published and historical JSA Versions must continue to resolve the exact attachment content selected at authoring time even after an administrator replaces the current library file.

## Decision

- File binaries are stored outside Oracle under the configured `ATTACHMENT_STORAGE_ROOT`.
- JSAMS stores only a relative storage key. Absolute machine paths are deployment configuration and never replicated business data.
- The physical key begins with the owning Site/Rig/Department IDs and ends with an application-generated UUID plus a sanitized original name.
- An approved third-party synchronization product copies the binary tree between site filesystems. JSAMS does not implement or schedule that synchronization.
- Oracle stores governed folder, logical asset, immutable asset-version, size, MIME type, SHA-256 checksum, relative key, status, ownership, audit, and JSA-version association metadata.
- Oracle GoldenGate replicates that metadata and its source primary/foreign keys only. It does not replicate file bytes, mapped-drive configuration, filesystem timestamps, or sequence state.
- Replacing a file creates a new immutable asset version and updates the logical asset's current-version pointer. It never overwrites or deletes the old version.
- A JSA Version snapshots and references the exact attachment asset version selected. Historical Published JSA Versions therefore continue to use their original file version.
- Attachment administration requires the dedicated application permission plus effective `CAN_ACT` scope. Selection and download require effective `CAN_VIEW` scope.

## Consequences

Every participating site must provision a writable mapped/local root with the same relative-key namespace, configure the third-party synchronization product, protect the directory from unauthorized access, and monitor synchronization failures independently of GoldenGate. A metadata record can arrive before its binary; operations must treat a missing binary as a storage/synchronization incident rather than silently substitute another version.

Backups, retention, malware scanning, synchronization SLA, conflict handling for out-of-band filesystem changes, and disaster-recovery procedures must be defined operationally before production rollout. Files must be introduced through JSAMS administration; manual edits beneath the managed root are unsupported.
