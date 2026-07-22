# Database conventions

Phase 0 creates `JSA_SCHEMA_VERSION`. Phase 1 adds the site, identity, authorization, and data-scope foundation described below; it does not add JSA, workflow, translation, review, or risk-matrix business tables.

- Tables: `JSA_*` or `SYS_*`; sequences: `SEQ_<ENTITY>`.
- Constraints: `PK_<TABLE>`, `FK_<CHILD>_<PARENT>`, `UK_<TABLE>_<PURPOSE>`, `CHK_<TABLE>_<PURPOSE>`; indexes: `IX_<TABLE>_<PURPOSE>`.
- Names must fit the actual Oracle target's identifier limit and remain Oracle 19c-compatible.
- `NUMBER(19)` primary keys use explicit sequences and are API strings. Never use `MAX(ID)+1`.
- Mutable Phase 1 entities use `CREATED_AT`, `CREATED_BY`, `UPDATED_AT`, `UPDATED_BY`, and `ROW_VERSION`. Site-owned records additionally identify their owning/default and created/updated site where meaningful.
- Each replicated table requires a primary key. Sites use non-overlapping sequence ranges; GoldenGate preserves source PK/FK values and does not synchronize `NEXTVAL`.
- Prefer status/retirement over physical deletion where audit or replication conflicts can occur. Cross-site updates are forbidden unless a later requirement allows them.
- Each immutable numeric migration has a rollback. No ORM synchronization or generated schema mutation is allowed.

Final site IDs, sequence ranges, topology, and business-audit persistence remain deliberately undecided. Migration 002 therefore contains no site/range seed data.

## Phase 1 ownership categories

- Global reference tables: `SYS_SITE`, `SYS_ROLE`, and `SYS_PERMISSION`.
- Site-owned reference/configuration tables: `SYS_RIG`, `SYS_DEPARTMENT`, and `SYS_SITE_SEQUENCE_RANGE`.
- Site-administered identity: `SYS_USER`; `CREATED_SITE_ID` and `UPDATED_SITE_ID` identify administrative provenance while optional defaults identify the user's normal context.
- Governed association tables: `SYS_USER_ROLE`, `SYS_ROLE_PERMISSION`, `SYS_USER_PERMISSION_OVERRIDE`, and `SYS_USER_DATA_SCOPE`. They are retired with `IS_ACTIVE='N'`, not physically deleted during ordinary operation.

All `NUMBER(19)` identifiers are selected with `TO_CHAR` by Oracle repositories and exposed as JSON strings. JavaScript `number` must never carry these identifiers.

## Phase 1 tables

The standard mutable columns used below are:

| Column                     | Type                 | Rule                                                    |
| -------------------------- | -------------------- | ------------------------------------------------------- |
| `IS_ACTIVE`                | `CHAR(1)`            | `Y` or `N`; defaults to `Y`.                            |
| `CREATED_AT`, `UPDATED_AT` | `TIMESTAMP(6)`       | Required; defaults to `SYSTIMESTAMP`.                   |
| `CREATED_BY`, `UPDATED_BY` | `VARCHAR2(255 CHAR)` | Required enterprise/application actor identity.         |
| `ROW_VERSION`              | `NUMBER(19)`         | Required, starts at 1, and supports optimistic locking. |

### `SYS_SITE`

Deployment and ownership boundary. Columns: `SITE_ID NUMBER(19)`, `SITE_CODE VARCHAR2(50 CHAR)`, `SITE_NAME VARCHAR2(200 CHAR)`, `SEQUENCE_CODE VARCHAR2(50 CHAR)`, `TIMEZONE_NAME VARCHAR2(100 CHAR)`, and the standard mutable columns. `PK_SYS_SITE` is the primary key; site and sequence codes have named unique constraints. Active and row-version checks apply.

Sequence: `SEQ_SYS_SITE`.

### `SYS_RIG`

Rig owned by one site. Columns: `RIG_ID NUMBER(19)`, `SITE_ID NUMBER(19)`, `RIG_CODE VARCHAR2(50 CHAR)`, `RIG_NAME VARCHAR2(200 CHAR)`, `CREATED_SITE_ID NUMBER(19)`, `UPDATED_SITE_ID NUMBER(19)`, and the standard mutable columns. `PK_SYS_RIG` is the primary key. `FK_SYS_RIG_SITE`, `FK_SYS_RIG_CREATED_SITE`, and `FK_SYS_RIG_UPDATED_SITE` reference `SYS_SITE`. `(SITE_ID, RIG_CODE)` defines code uniqueness; `(RIG_ID, SITE_ID)` supports hierarchy-preserving composite foreign keys. `IX_SYS_RIG_SITE` supports site/active lookup.

Sequence: `SEQ_SYS_RIG`.

### `SYS_DEPARTMENT`

Department scoped to a site and optionally a rig. Columns: `DEPARTMENT_ID NUMBER(19)`, `SITE_ID NUMBER(19)`, nullable `RIG_ID NUMBER(19)`, `DEPARTMENT_CODE VARCHAR2(50 CHAR)`, `DEPARTMENT_NAME VARCHAR2(200 CHAR)`, created/updated site IDs, and standard mutable columns. Site and rig/site foreign keys enforce hierarchy. `(SITE_ID, DEPARTMENT_CODE)` defines the confirmed Phase 1 uniqueness scope. Composite unique constraints support scope validation. `IX_SYS_DEPT_SITE_RIG` supports site/rig lookup.

Sequence: `SEQ_SYS_DEPARTMENT`.

### `SYS_SITE_SEQUENCE_RANGE`

Governed range metadata, not an ID generator. Columns: `RANGE_ID NUMBER(19)`, `SITE_ID NUMBER(19)`, `SEQUENCE_CODE VARCHAR2(50 CHAR)`, `RANGE_START NUMBER(19)`, `RANGE_END NUMBER(19)`, `EFFECTIVE_FROM TIMESTAMP(6)`, nullable `EFFECTIVE_TO TIMESTAMP(6)`, and standard mutable columns. The table has a site foreign key, unique `(SITE_ID, SEQUENCE_CODE)`, range/date checks, and `IX_SYS_SEQ_RANGE_LOOKUP`. Startup validation detects active overlap for the same sequence code across sites and checks local sequence next values. No current-value column exists.

Sequence: `SEQ_SYS_SITE_SEQ_RANGE`.

### `SYS_USER`

Application mapping for an enterprise identity; no password column exists. Columns: `USER_ID NUMBER(19)`, `ENTERPRISE_IDENTITY_KEY VARCHAR2(255 CHAR)`, `USERNAME VARCHAR2(255 CHAR)`, `DISPLAY_NAME VARCHAR2(255 CHAR)`, nullable `EMAIL VARCHAR2(320 CHAR)`, nullable default site/rig/department IDs, created/updated site IDs, and standard mutable columns. Stable identity key and username are individually unique. Composite foreign keys enforce default rig/site and department/site consistency. `IX_SYS_USER_DEFAULTS` supports default-context lookup.

Sequence: `SEQ_SYS_USER`.

### `SYS_ROLE`

Application role, explicitly separate from workflow roles. Columns: `ROLE_ID NUMBER(19)`, `ROLE_CODE VARCHAR2(100 CHAR)`, `ROLE_NAME VARCHAR2(200 CHAR)`, nullable `DESCRIPTION VARCHAR2(1000 CHAR)`, `IS_SYSTEM_MANAGED CHAR(1)`, and standard mutable columns. Role code is unique; active/system flags and row version are checked.

Sequence: `SEQ_SYS_ROLE`.

### `SYS_PERMISSION`

Reusable application permission. Columns: `PERMISSION_ID NUMBER(19)`, `PERMISSION_CODE VARCHAR2(150 CHAR)`, `PERMISSION_NAME VARCHAR2(200 CHAR)`, nullable `DESCRIPTION VARCHAR2(1000 CHAR)`, `PERMISSION_GROUP VARCHAR2(100 CHAR)`, and standard mutable columns. Permission code is unique.

Sequence: `SEQ_SYS_PERMISSION`.

Only the already-confirmed `SYSTEM_HEALTH_VIEW` and `SYSTEM_ADMIN` permissions are supported by the optional Phase 1 bootstrap. Later permission catalogues are not seeded.

### `SYS_USER_ROLE`

Auditable user/role assignment. Columns: `USER_ROLE_ID NUMBER(19)`, `USER_ID NUMBER(19)`, `ROLE_ID NUMBER(19)`, `ASSIGNED_AT TIMESTAMP(6)`, nullable `REVOKED_AT TIMESTAMP(6)`, and standard mutable columns. Named foreign keys reference user and role. `IX_SYS_USER_ROLE_ACTIVE` is a function-based unique index that rejects duplicate active assignments while allowing historical inactive rows. `IX_SYS_USER_ROLE_USER` supports context resolution.

Sequence: `SEQ_SYS_USER_ROLE`.

### `SYS_ROLE_PERMISSION`

Auditable role/permission assignment. Columns: `ROLE_PERMISSION_ID NUMBER(19)`, `ROLE_ID NUMBER(19)`, `PERMISSION_ID NUMBER(19)`, `ASSIGNED_AT TIMESTAMP(6)`, nullable `REVOKED_AT TIMESTAMP(6)`, and standard mutable columns. Named foreign keys reference role and permission. `IX_SYS_ROLE_PERM_ACTIVE` prevents duplicate active assignments; `IX_SYS_ROLE_PERM_ROLE` supports permission resolution.

Sequence: `SEQ_SYS_ROLE_PERMISSION`.

### `SYS_USER_PERMISSION_OVERRIDE`

Per-user permission adjustment. Columns: `USER_PERMISSION_OVERRIDE_ID NUMBER(19)`, `USER_ID NUMBER(19)`, `PERMISSION_ID NUMBER(19)`, `EFFECT_CODE VARCHAR2(10 CHAR)`, nullable `REASON_TEXT VARCHAR2(1000 CHAR)`, `EFFECTIVE_FROM TIMESTAMP(6)`, nullable `EFFECTIVE_TO TIMESTAMP(6)`, and standard mutable columns. Effect is checked to `ALLOW` or `DENY`; date order is checked. `IX_SYS_USER_OVR_ACTIVE` prevents multiple active overrides for one user/permission; `IX_SYS_USER_OVR_USER` supports resolution. Effective precedence is DENY, ALLOW, role grant, default deny per ADR-003.

Sequence: `SEQ_SYS_USER_PERM_OVERRIDE`.

### `SYS_USER_DATA_SCOPE`

Independent site, rig, or department scope assignment. Columns: `USER_DATA_SCOPE_ID NUMBER(19)`, `USER_ID NUMBER(19)`, `SCOPE_TYPE VARCHAR2(20 CHAR)`, required `SITE_ID NUMBER(19)`, nullable `RIG_ID NUMBER(19)` and `DEPARTMENT_ID NUMBER(19)`, `CAN_VIEW CHAR(1)`, `CAN_ACT CHAR(1)`, `EFFECTIVE_FROM TIMESTAMP(6)`, nullable `EFFECTIVE_TO TIMESTAMP(6)`, and standard mutable columns. Named composite foreign keys enforce site/rig/department relationships. Checks allow only `SITE`, `RIG`, or `DEPARTMENT`, require the matching target combination, and require view access whenever action access is granted. `IX_SYS_USER_SCOPE_ACTIVE` prevents duplicate active scope grants and `IX_SYS_USER_SCOPE_USER` supports context resolution.

Sequence: `SEQ_SYS_USER_DATA_SCOPE`.

## Constraint and index inventory

- Primary keys: `PK_SYS_SITE`, `PK_SYS_RIG`, `PK_SYS_DEPARTMENT`, `PK_SYS_SITE_SEQ_RANGE`, `PK_SYS_USER`, `PK_SYS_ROLE`, `PK_SYS_PERMISSION`, `PK_SYS_USER_ROLE`, `PK_SYS_ROLE_PERMISSION`, `PK_SYS_USER_PERM_OVERRIDE`, and `PK_SYS_USER_DATA_SCOPE`.
- Code/identity unique constraints: `UK_SYS_SITE_CODE`, `UK_SYS_SITE_SEQ_CODE`, `UK_SYS_RIG_SITE_CODE`, `UK_SYS_DEPT_SITE_CODE`, `UK_SYS_SITE_SEQ_RANGE`, `UK_SYS_USER_IDENTITY`, `UK_SYS_USER_USERNAME`, `UK_SYS_ROLE_CODE`, and `UK_SYS_PERMISSION_CODE`. Composite identity/hierarchy unique constraints on rig and department support relational composite foreign keys.
- Foreign keys: every site, rig, department, user, role, permission, assignment, override, and scope reference uses a named `FK_*`; no cascade delete is configured.
- Checks: all active/system/access flags, positive row versions, override effects, scope types/targets, date order, range bounds, revoked state, and user default hierarchy use named `CHK_*` constraints.
- Lookup indexes: `IX_SYS_RIG_SITE`, `IX_SYS_DEPT_SITE_RIG`, `IX_SYS_SEQ_RANGE_LOOKUP`, `IX_SYS_USER_DEFAULTS`, `IX_SYS_USER_ROLE_USER`, `IX_SYS_ROLE_PERM_ROLE`, `IX_SYS_USER_OVR_USER`, and `IX_SYS_USER_SCOPE_USER`.
- Active uniqueness indexes: `IX_SYS_USER_ROLE_ACTIVE`, `IX_SYS_ROLE_PERM_ACTIVE`, `IX_SYS_USER_OVR_ACTIVE`, and `IX_SYS_USER_SCOPE_ACTIVE`. These function-based unique indexes ignore inactive history rows while rejecting duplicate active assignments.

## Phase 1 replication and sequence invariants

- Migration 002 creates all 11 sequences but does not choose an operational site ID or range.
- `db:bootstrap:phase1` requires deployment-supplied approved values, configures only an allowlisted sequence set, and uses bind variables for all data.
- `LOCAL_SITE_ID` enables fail-closed startup validation for missing, overlapping, or exhausted local sequence ranges.
- GoldenGate copies Phase 1 PK/FK values unchanged. Targets never regenerate replicated IDs, and sequence state is never replicated.
- Parent/child inserts participate in one application-service transaction. Oracle DDL remains non-transactional.

## Phase 0A development policy

The Windows development environment selects node-oracledb Thick mode. Oracle Database 23.0.0.0.0 and Instant Client 23.9 were verified; Phase 0 SQL uses only Oracle 19c-compatible features, although execution against an actual 19c instance was not part of Phase 0A. The dedicated development schema is `JSA_APP`, as confirmed during Phase 0A; no rollback runs until session user, current schema, service `PDBAPPS`, project-object ownership, and non-production status are confirmed. Ordinary migration SQL uses semicolons; PL/SQL ends with slash on a separate line. Oracle DDL implicitly commits, so rollback is compensating DDL and partial failures require operator review.
