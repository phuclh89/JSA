# Database conventions

Phase 0 creates only `JSA_SCHEMA_VERSION`; there is no business schema.

- Tables: `JSA_*` or `SYS_*`; sequences: `SEQ_<ENTITY>`.
- Constraints: `PK_<TABLE>`, `FK_<CHILD>_<PARENT>`, `UK_<TABLE>_<PURPOSE>`, `CHK_<TABLE>_<PURPOSE>`; indexes: `IX_<TABLE>_<PURPOSE>`.
- Names must fit the actual Oracle target's identifier limit and remain Oracle 19c-compatible.
- Future `NUMBER(19)` primary keys use explicit sequences and are API strings. Never use `MAX(ID)+1`.
- Future audit columns should include created/updated identity and timestamps plus site ownership; exact columns await requirements.
- Each replicated table requires a primary key. Sites use non-overlapping sequence ranges; GoldenGate preserves source PK/FK values and does not synchronize `NEXTVAL`.
- Prefer status/retirement over physical deletion where audit or replication conflicts can occur. Cross-site updates are forbidden unless a later requirement allows them.
- Each immutable numeric migration has a rollback. No ORM synchronization or generated schema mutation is allowed.

Final site IDs, sequence ranges, topology, and audit details are deliberately undecided.
