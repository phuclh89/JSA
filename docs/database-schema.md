# Database conventions

Phase 0 creates `JSA_SCHEMA_VERSION`. Phase 1 adds the site, identity, authorization, and data-scope foundation. Phase 2 adds governed master data and versioned Risk Matrix configuration; it does not add JSA authoring, workflow, translation, review, or reporting tables.

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

Department scoped to a site and optionally a rig. Columns: `DEPARTMENT_ID NUMBER(19)`, `SITE_ID NUMBER(19)`, nullable `RIG_ID NUMBER(19)`, `DEPARTMENT_CODE VARCHAR2(50 CHAR)`, `DEPARTMENT_NAME VARCHAR2(200 CHAR)`, created/updated site IDs, and standard mutable columns. Site and rig/site foreign keys enforce hierarchy. Migration 013 replaces the original Site-only code constraint with `UK_SYS_DEPT_RIG_CODE` on `(SITE_ID, RIG_ID, DEPARTMENT_CODE)`, allowing the same governed code on different Rigs while rejecting duplicates inside one Rig. Composite unique constraints support scope validation. `IX_SYS_DEPT_SITE_RIG` supports site/rig lookup.

Sequence: `SEQ_SYS_DEPARTMENT`.

### `SYS_SITE_SEQUENCE_RANGE`

Governed range metadata, not an ID generator. Columns: `RANGE_ID NUMBER(19)`, `SITE_ID NUMBER(19)`, `SEQUENCE_CODE VARCHAR2(50 CHAR)`, `RANGE_START NUMBER(19)`, `RANGE_END NUMBER(19)`, `EFFECTIVE_FROM TIMESTAMP(6)`, nullable `EFFECTIVE_TO TIMESTAMP(6)`, and standard mutable columns. The table has a site foreign key, unique `(SITE_ID, SEQUENCE_CODE)`, range/date checks, and `IX_SYS_SEQ_RANGE_LOOKUP`. Startup validation detects active overlap for the same sequence code across sites and checks local sequence next values. No current-value column exists.

Sequence: `SEQ_SYS_SITE_SEQ_RANGE`.

### `SYS_USER`

JSAMS application-user mapping for an enterprise identity; this is an internal authorization record, not a local-login account. Actual columns are `USER_ID NUMBER(19)`, `ENTERPRISE_IDENTITY_KEY VARCHAR2(255 CHAR)`, `USERNAME VARCHAR2(255 CHAR)`, `DISPLAY_NAME VARCHAR2(255 CHAR)`, nullable `EMAIL VARCHAR2(320 CHAR)`, nullable default site/rig/department IDs, created/updated site IDs, and the standard mutable columns including `IS_ACTIVE` and `ROW_VERSION`.

- `USER_ID` is the internal Oracle primary key and is exposed as a decimal string.
- `ENTERPRISE_IDENTITY_KEY` stores the stable external identity-provider key. Under the current Active Directory LDAP integration, the preferred value is `ad-object-guid:<canonical objectGUID>`. It is the unique preferred directory-to-application link; username fallback is permitted only as an explicitly configured migration aid and is not a replacement stable key.
- `USERNAME` stores the unique canonical enterprise username used operationally, for example `phuclh`.
- `DISPLAY_NAME` and `EMAIL` are profile/display metadata. They are neither interchangeable with `USERNAME` nor stable identity keys.
- `IS_ACTIVE` enables or blocks JSAMS application access only; it does not modify the enterprise identity or Active Directory account.
- Default Site/Rig/Department fields describe normal application context and do not themselves grant data scope.

Composite foreign keys enforce default rig/site and department/site consistency. `IX_SYS_USER_DEFAULTS` supports default-context lookup. The current table already has an immutable-identity equivalent in `ENTERPRISE_IDENTITY_KEY`; therefore no missing immutable-ID column is claimed. It has no separate identity-provider or last-login column, and this documentation does not invent either.

No password-bearing column is permitted under the approved enterprise-identity architecture, including `PASSWORD`, `PASSWORD_HASH`, `PASSWORD_SALT`, `PASSWORD_RESET_TOKEN`, `LOCAL_PASSWORD`, `FAILED_PASSWORD`, or `PASSWORD_EXPIRY`. Adding any such field would require a future explicitly approved architecture that supersedes the current model and a new migration; applied migration 002 must not be edited.

Sequence: `SEQ_SYS_USER`.

The authorization relationships remain separate:

```text
SYS_USER
  -> SYS_USER_ROLE
       -> SYS_ROLE_PERMISSION
  -> SYS_USER_PERMISSION_OVERRIDE
  -> SYS_USER_DATA_SCOPE
  -> JSA_WF_ROLE_ASSIGNMENT
```

`JSA_WORKFLOW_TASK.ASSIGNEE_USER_ID` identifies the current workflow assignee separately from workflow-role eligibility. Identity, role, permission, override, data scope, workflow role, and current assignment must not be collapsed into `SYS_USER`.

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
- Code/identity unique constraints: `UK_SYS_SITE_CODE`, `UK_SYS_SITE_SEQ_CODE`, `UK_SYS_RIG_SITE_CODE`, `UK_SYS_DEPT_RIG_CODE`, `UK_SYS_SITE_SEQ_RANGE`, `UK_SYS_USER_IDENTITY`, `UK_SYS_USER_USERNAME`, `UK_SYS_ROLE_CODE`, and `UK_SYS_PERMISSION_CODE`. Composite identity/hierarchy unique constraints on rig and department support relational composite foreign keys.
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

## Phase 2 master data

Migration 004 adds `SYS_JOB_TYPE`, `SYS_HAZARD_PROMPT`, `SYS_POSITION`, `SYS_TOOL_CATEGORY`, `SYS_TOOL`, `SYS_LANGUAGE`, `SYS_PROCEDURE_REFERENCE`, and `SYS_SYSTEM_PARAMETER`. Every table has its own `NUMBER(19)` primary key and sequence, active state, display order, audit columns, and optimistic `ROW_VERSION`.

Master-data codes are case-insensitively unique among active records inside their exact ownership scope. The supported scope hierarchy is `GLOBAL`, `SITE`, `RIG`, and, where applicable, `DEPARTMENT`; composite foreign keys prevent a Rig or Department from being paired with the wrong Site. Ordinary administration deactivates records instead of deleting them. Tools must reference an active Tool Category. System Parameters support the declared types `STRING`, `INTEGER`, `DECIMAL`, `BOOLEAN`, `DATE`, and `JSON`; secret-like keys are rejected by the application because this table is not a secret store.

No production master-data rows are seeded. Job types, prompts, positions, tools, languages, procedure references, parameter keys/values, and their ownership scopes require approved operational input.

The configured development Oracle database contains the confirmed 35-item PV Drilling Position catalogue at `GLOBAL` scope with null Site/Rig/Department ownership. Stable Position codes and exact names are stored in the supplied display order. The idempotent seed promotes an existing active code/name match in place to preserve `POSITION_ID`; any duplicate active scoped match is soft-deactivated rather than deleted.

The configured development Oracle database also contains the confirmed 53-item PV Drilling Tool catalogue at `GLOBAL` scope under the Global `JSA_TOOLS — JSA Tools` Tool Category. Tool codes and exact names follow the supplied display order, and Site/Rig/Department ownership is null. The idempotent seed preserves a matching existing `TOOL_ID`, moves it to the governed category/scope, and soft-deactivates duplicate active scoped matches.

The configured development Oracle database contains two active Sites: `OFFSHORE` (`SITE_ID=1000000`) and `ONSHORE` (`SITE_ID=1000100`). Offshore owns `PVD-I`, `PVD-II`, `PVD-III`, `PVD-V`, `PVD-VI`, `PVD-VIII`, `PVD-IX`, and `PVD-X`; Onshore owns `SHOREBASE`. The former development Site and Rig rows were corrected in place to `OFFSHORE` and `PVD-I`, preserving their identifiers and all existing foreign-key relationships.

Each of the nine active Rigs contains the same ten active Departments: `3P — Third Party`, `DR — Drilling`, `EL — Electrician`, `ET — Electronics`, `ME — Mechanic`, `MAR — Marine`, `MED — Medic`, `WE — Welder`, `CAT — Catering`, and `STC — STC`. The configured development database therefore contains 90 active Rig-scoped Department rows. The governed-code correction updates the existing rows in place so their `DEPARTMENT_ID` values and foreign-key relationships remain unchanged.

The confirmed 25-item PV Drilling Hazard Assessment Prompt checklist is configured once at `GLOBAL` scope with null Site/Rig ownership, so the same governed rows are effective for all nine active Rigs. The prior Rig-scoped rows are promoted in place to retain their `PROMPT_ID` values. The development fixtures `ENERGY`, `DROPPED`, and `PINCH` are inactive rather than deleted so historical JSA prompt snapshots remain interpretable.

## Phase 2 Risk Matrix model

- `JSA_RISK_MATRIX` is the stable Matrix identity and fixes the dimension at 3 or 5.
- `JSA_RISK_MATRIX_VERSION` owns one versioned configuration. Version codes are unique inside a Matrix.
- `JSA_RISK_LIKELIHOOD` and `JSA_RISK_SEVERITY` store textual display codes, labels, definitions, optional numeric metadata, and explicit display order. Severity additionally supports separate people, asset, and environmental definitions.
- `JSA_RISK_RESULT` stores the configured semantic result, color/guidance metadata, and prohibited flag.
- `JSA_RISK_MATRIX_CELL` is an explicit lookup from one likelihood and one severity to a configured Risk Result and textual and/or numeric rating. Composite foreign keys require the axes, result, and cell to belong to the same Matrix Version. There is no arithmetic score or hard-coded risk formula.
- `JSA_RIG_MATRIX_ASSIGNMENT` gives one Rig an effective-dated Matrix Version. `EFFECTIVE_TO` is exclusive and must be later than `EFFECTIVE_FROM`.

A Matrix Version is complete only when it has exactly its declared dimension of active likelihoods and severities, at least one active Risk Result, and one valid active cell for every likelihood/severity pair. Thus a complete 3×3 version has 9 cells and a complete 5×5 version has 25 cells. Duplicate pairs, missing ratings, foreign-version references, inactive references, and extra or missing axes block assignment.

Configuration remains editable only while a Matrix Version has never been assigned. Once referenced by any current or historical Rig assignment, its axes, results, and cells are immutable; material changes require a new version. Assignment writes lock the Rig row before overlap detection so concurrent requests for the same Rig serialize. The application rejects intersecting active periods, incomplete/inactive versions, inactive parent Matrices, unauthorized Rig scopes, and ambiguous effective lookup.

Migration 004 creates 15 sequences for its 15 tables. `db:bootstrap:phase2` only configures those allowlisted sequences from the already-approved local Phase 1 range; it does not insert business data. GoldenGate must preserve all source IDs and must not replicate sequence state.

The configured development Oracle database assigns `DEV-5X5 / PVDRILLING-V2` to `PVD-V`. That immutable configuration contains five Probability rows, five Severity rows, four Risk Results (Dark Green, Light Green, Yellow, and Red), and 25 explicit cells matching the confirmed PV Drilling legacy 5x5 matrix.

The active `PVD-3X3 / V1` Matrix Version is based on Procedure Reference `P1.04.09`. It contains three Likelihood rows, three Severity rows with separate people/asset/environment definitions, three Risk Results, and nine explicit numeric cells. It is assigned to `PVD-I`, `PVD-II`, `PVD-III`, `PVD-VI`, `PVD-VIII`, `PVD-IX`, `PVD-X`, and `SHOREBASE`. Each Rig has exactly one current effective assignment; replaced assignments are effective-ended and retained as history.

## Phase 3 JSA Draft and version model

Migration 005 adds `JSA_MASTER`, `JSA_VERSION`, `JSA_VERSION_PROMPT`, `JSA_VERSION_PROMPT_COVERAGE`, `JSA_VERSION_TASK`, `JSA_VERSION_HAZARD`, `JSA_VERSION_CONTROL`, `JSA_VERSION_BASIC_STEP`, `JSA_VER_BASIC_STEP_PERFORMER`, `JSA_VER_BASIC_STEP_SUPERVISOR`, `JSA_VER_BASIC_STEP_TOOL`, `JSA_VERSION_PROCEDURE_REF`, and `JSA_VERSION_ATTACHMENT`.

`JSA_VERSION_PROCEDURE_REF` is retained for historical compatibility. Current JSA creation/revision does not collect Procedure References, and an aggregate Working Version save deactivates any carried legacy rows by persisting an empty Procedure Reference collection.

`JSA_MASTER` owns the stable business identity, ownership hierarchy, creator, lifecycle status, number status, and nullable Current/Working Version pointers. Initially Current is null and Working references the first Draft `JSA_VERSION`; `JSA_NUMBER` is temporary and `NUMBER_STATUS='TEMPORARY'`. Initial publication replaces it with the immutable Official number formatted `<Rig name>-<Department code>-NNNN` and sets `NUMBER_STATUS='OFFICIAL'`. The displayed Rig segment comes from `SYS_RIG.RIG_NAME`, while counter ownership continues to use the exact Rig/Department identifiers. Composite foreign keys ensure both pointers belong to the same Master.

Migration 011 adds `JSA_NUMBER_COUNTER`, keyed by the exact Rig/Department pair and linked back to the owning Site hierarchy. `LAST_NUMBER` is constrained to `0`–`9999`; publication locks the Department/counter and increments it without `MAX()+1`. `TRG_JSA_OFFICIAL_NUM_IMMUTABLE` rejects later changes to `JSA_NUMBER`, `NUMBER_SCOPE_KEY`, or `NUMBER_STATUS` after official assignment.

Migration 010 aligns `JSA_VERSION` with the confirmed creation model. `JOB_TYPE_ID` is nullable and is not populated for new JSAs; existing historical values are retained. `LANGUAGE_ID` is mandatory, new source versions resolve the single active `SYS_LANGUAGE.LANGUAGE_CODE='EN'` row server-side, and `TRG_JSA_VERSION_ENGLISH` rejects insert/update attempts using another or inactive language. Non-English content remains a separate Translation object rather than a source JSA Version. The nullable `JOB_DESCRIPTION`, `PTW_REFERENCE`, `LOCATION_TEXT`, and `PERSONNEL_TEXT` columns plus `PTW_REQUIRED_FLAG` created by migration 005 remain only for schema and historical-data compatibility; current JSA creation/revision authors only `JOB_TITLE`, does not collect those legacy fields, and Draft-header saves leave historical values untouched. `JSA_VERSION_PROMPT_COVERAGE` is likewise retained for schema/history compatibility, but current authoring stores prompts as independent selections and aggregate saves deactivate legacy coverage rows.

Every version-owned row has its own `NUMBER(19)` primary key and stable `LOGICAL_KEY`, unique inside its version. Composite foreign keys prevent Task, Hazard, Control, prompt coverage, Basic Job Step, and assignment links from crossing versions. Active flags and optimistic `ROW_VERSION` support soft deactivation rather than physical replacement.

Hazards store initial/residual likelihood and severity IDs plus server-derived cell, textual rating, result code/name, and prohibited snapshots. Residual Severity must equal Initial Severity; only Residual Likelihood is independently reassessed after Controls. Migration 009 adds `CHK_JSA_HAZ_RES_SEV_MATCH`, while application save and submission validation enforce the same rule. Each active Hazard has exactly one active Control by confirmed business rule. Migration 008 adds `UX_JSA_VER_CTL_ACTIVE_HAZ`, a function-based unique index that prevents more than one active `JSA_VERSION_CONTROL` for a Hazard; application save and submission validation require the corresponding minimum of one. Basic Job Steps are independently ordered and may optionally link to a Task. Performer/Supervisor Position and Tool assignments retain source IDs and code/name snapshots. Procedure references retain governed snapshots. Attachments contain metadata/status/storage key only.

Migration 005 creates one sequence per table key plus `SEQ_JSA_BUSINESS_NUMBER` (14 total). All are included in startup site-range validation and the controlled Phase 3 bootstrap. GoldenGate copies IDs/logical keys unchanged and never replicates sequence state.

## Attachment Library model

Migration 012 adds:

- `JSA_ATTACHMENT_FOLDER`: a nested governed folder with immutable Site/Rig/Department scope, optional same-scope parent, active state, site provenance, audit fields, and optimistic row version.
- `JSA_ATTACHMENT_ASSET`: the logical reusable attachment, folder ownership, business name/description, active state, and pointer to its current immutable version.
- `JSA_ATTACHMENT_ASSET_VERSION`: immutable version number, original file name, content type, byte size, SHA-256 checksum, relative storage key, storage status, source site, and creation audit.
- `JSA_VERSION_ATTACHMENT.LIBRARY_ASSET_VERSION_ID`: the exact library file version selected by the JSA Version.
- `JSA_VERSION_ATTACHMENT.CONTENT_SHA256`: the checksum snapshot retained with the JSA attachment metadata.

The model separates logical replacement from historical identity: Replace inserts a new `JSA_ATTACHMENT_ASSET_VERSION` and moves only `CURRENT_VERSION_ID`; prior versions and existing JSA associations remain unchanged. The binary is not stored in Oracle. `STORAGE_KEY` is relative to the deployment-specific `ATTACHMENT_STORAGE_ROOT` and begins with the owning Site/Rig/Department IDs.

`SEQ_JSA_ATTACHMENT_FOLDER`, `SEQ_JSA_ATTACHMENT_ASSET`, and `SEQ_JSA_ATTACHMENT_VERSION` use the same non-overlapping site-range invariant as other replicated identifiers. `db:bootstrap:attachments` configures only these allowlisted sequences after migration 012. GoldenGate preserves all attachment metadata PK/FK values and does not replicate sequence state, absolute paths, or file bytes; an external product synchronizes the corresponding filesystem tree.

## Phase 0A development policy

The Windows development environment selects node-oracledb Thick mode. Oracle Database 23.0.0.0.0 and Instant Client 23.9 were verified; Phase 0 SQL uses only Oracle 19c-compatible features, although execution against an actual 19c instance was not part of Phase 0A. The dedicated development schema is `JSA_APP`, as confirmed during Phase 0A; no rollback runs until session user, current schema, service `PDBAPPS`, project-object ownership, and non-production status are confirmed. Ordinary migration SQL uses semicolons; PL/SQL ends with slash on a separate line. Oracle DDL implicitly commits, so rollback is compensating DDL and partial failures require operator review.

## Phase 4 Approval Workflow and Initial Publishing

Migration 006 extends Master status with `PUBLISHED`, expands Version status to 30 characters for all review/terminal states, and adds `PUBLISHED_AT`, `PUBLISHED_BY_USER_ID`, and `PUBLISHED_BY_USERNAME`. A check constraint requires complete publication metadata only for `PUBLISHED`.

Configuration tables are `JSA_WORKFLOW_DEFINITION`, `JSA_WORKFLOW_STEP`, `JSA_WORKFLOW_BINDING`, and `JSA_WF_ROLE_ASSIGNMENT`. Runtime/evidence tables are `JSA_WORKFLOW_INSTANCE`, `JSA_WORKFLOW_TASK`, `JSA_WORKFLOW_ACTION`, `SYS_NOTIFICATION`, and `SYS_NOTIFICATION_OUTBOX`.

`JSA_ASSERT_VERSION_MUTABLE` plus twelve `TRG_JSA_*` triggers block mutation of a Published Version and all version-owned snapshot children. Application state predicates remain an additional guard.

Phase 4 owns nine explicit sequences for definition, step, binding, role assignment, instance, task, action, notification, and outbox. All participate in startup Site-range validation and Phase 4 bootstrap; `MAX(id)+1` is prohibited.

## Phase 4.5 Access Administration and Workflow Evidence

Migration 007 adds `SYS_ACCESS_ADMIN_AUDIT`, whose `AUDIT_EVENT_ID NUMBER(19)` is generated only by `SEQ_SYS_ACCESS_ADMIN_AUDIT`. Each row records action, target type/ID and optional username snapshot, actor ID/username/display snapshots, governed Site/Rig/Department context, JSON before/after state, reason, correlation ID, occurrence time, and created Site. Named actor/scope foreign keys and JSON checks apply. `IX_SYS_ACCESS_AUDIT_TIME`, `IX_SYS_ACCESS_AUDIT_ACTOR`, `IX_SYS_ACCESS_AUDIT_TARGET`, and `IX_SYS_ACCESS_AUDIT_SCOPE` support governed queries. `TRG_SYS_ACCESS_AUDIT_IMMUTABLE` rejects ordinary UPDATE and DELETE.

`JSA_WORKFLOW_TASK` gains immutable-at-creation snapshots for step code/name, workflow Role code, and assignee username/display name. `JSA_WORKFLOW_ACTION` gains step code/name, workflow Role code, and actor display-name snapshots. Existing records are backfilled by migration; later user profile, Role, scope, or workflow-assignment changes do not rewrite historical approval evidence.

The new audit sequence participates in the same Site-range startup validation, controlled Phase 4.5 sequence-only bootstrap, and GoldenGate invariants as every prior key: preserve source IDs, never regenerate target IDs, and never replicate sequence state.

## Phase 5 checkout, version lineage, and supersession

Migrations 014 and 015 add no new business table or sequence. `JSA_MASTER` gains `CHECKED_OUT_BY_USER_ID`, username/display-name snapshots, and `CHECKED_OUT_AT`; `CHK_JSA_MASTER_CHECKOUT` keeps those values consistent with the Working pointer while preserving the initial-draft case. `IX_JSA_MASTER_CURRENT_WORKING` and `IX_JSA_VERSION_BASE` support pointer and lineage reads.

`JSA_VERSION.BASE_VERSION_ID` is the explicit revision lineage. The status domain now includes `SUPERSEDED`; both Published and Superseded rows retain publication evidence. `JSA_ASSERT_VERSION_MUTABLE` blocks changes to children of either status. The root trigger permits exactly the metadata-only `PUBLISHED` to `SUPERSEDED` transition, rejects deletion and later mutation, and migration 015 recompiles all dependent child triggers after the procedure replacement.

Checkout clones the full active aggregate into new physical rows from the existing per-table sequences. Logical keys, hierarchy, catalogue snapshots, procedure snapshots, and exact attachment-library version/storage/checksum metadata are preserved. When the effective checkout Matrix differs from the Base Matrix, all copied initial and residual risk selections/results are cleared; no cross-Matrix score or code conversion is inferred.

## Phase 6 Browse/Search and user Favorites

Migration 016 creates `JSA_USER_FAVORITE` and `SEQ_JSA_USER_FAVORITE`. One row is retained per `(USER_ID,JSA_ID)`; `IS_ACTIVE`, `FAVORITED_AT`, and `UNFAVORITED_AT` implement idempotent soft activation/deactivation. The table has User/Master foreign keys, created/updated Site provenance, actor/time audit fields, and optimistic `ROW_VERSION`.

`IX_JSA_FAVORITE_USER_ACTIVE` supports the user list/count, and `IX_JSA_FAVORITE_MASTER_ACTIVE` supports Master eligibility. `IX_JSA_VERSION_BROWSE_STATE` and `IX_JSA_VERSION_BROWSE_ACTORS` support lifecycle, Matrix, time, and publisher predicates. Child content search reuses existing version-leading Task/Hazard/Control/Prompt indexes; no unsupported Oracle Text dependency or misleading B-tree index for contains-search was added.

`db:bootstrap:phase6` registers and positions only the Favorite sequence in the approved local Site range. GoldenGate preserves Favorite IDs and never replicates sequence state. The authoritative-site/conflict rule for simultaneous cross-site preference writes remains open.

## Phase 6C Cross-Rig Copy provenance

Migration 017 adds `JSA_COPY_PROVENANCE`, one immutable row per copied destination Master. It records the exact destination Version, source Master and Version, source Site/Rig snapshots, copy reason, actor identity snapshots, timestamp, created Site, and actor-scoped request key/hash. Composite foreign keys prevent source or destination Version/Master mismatches. `TRG_JSA_COPY_PROV_IMMUTABLE` rejects update and delete.

`UK_JSA_COPY_DESTINATION` enforces one origin for a copied Master and `UK_JSA_COPY_REQUEST` enforces idempotency per actor. `IX_JSA_COPY_SOURCE` supports source lineage and `IX_JSA_COPY_TIME` supports chronological investigation. `SEQ_JSA_COPY_PROVENANCE` is registered in the existing local Site range by the Phase 6C bootstrap.

## Phase 7 Translation model

Migration 018 creates `JSA_TRANSLATION`, `JSA_TRANSLATION_SEGMENT`, and append-only `JSA_TRANSLATION_ACTION`, with one explicit sequence per table. A Translation is unique by exact source Version and target language, snapshots Translator/assigner/STC identities, and supports only `ASSIGNED`, `IN_TRANSLATION`, `STC_REVIEW`, `RETURNED`, `PUBLISHED`, and `OUTDATED`.

Segments retain source physical ID, source logical key, entity/field/section identity, immutable source CLOB and SHA-256, target CLOB, display order, required flag, and optimistic row version. `JSA_ASSERT_TRANSL_MUTABLE` and triggers block target changes outside Translator states, segment inventory changes after initialization, final Translation mutation except Published→Outdated, Translation deletion, and action update/delete. Rollback 018 refuses any Translation history.
