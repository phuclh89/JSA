# JSAMS Business State

This document is the current source of truth for confirmed JSAMS business behavior. It describes domain concepts, lifecycle rules, ownership, authorization semantics, and open business decisions. Technical architecture, implementation history, database details, and test evidence belong in their dedicated documents.

## 1. Scope and business objectives

JSAMS manages Job Safety Analyses across multiple operating sites and drilling rigs. Its business purpose is to maintain controlled, reviewable, versioned safety content; preserve published and historical records; support role-based approval; keep rig-specific risk assessment meaningful; and permit controlled reuse without weakening site ownership or auditability.

Only confirmed business behavior belongs here; unconfirmed details are listed as open decisions rather than assumed.

## 2. Core JSA domain terminology

- **JSA Master**: the stable business identity and lifecycle container for one JSA across all its versions.
- **JSA Version**: a versioned snapshot of the JSA content and its related version-owned records.
- **Current Version**: the version currently recognized as the operative published version of a JSA Master.
- **Working Version**: the mutable version used for JSA creation or revision and approval before publication.
- **Base Version**: the immutable source version from which a Working Version was created.
- **Task**: a version-owned unit of work within a JSA.
- **Hazard**: a hazard identified for one Task.
- **Control**: a control associated with one Hazard.
- **Basic Job Step**: an ordered item in a separate, versioned execution-oriented list.
- **Position** and **Tool**: governed reference data selected for a Basic Job Step and snapshotted into the version.
- **Risk Matrix**: the rig-specific matrix used to assess Initial and Residual Risk.
- **Source JSA language**: English. Language is assigned by the system and is not selected during JSA creation.
- **Translation**: a separate language-specific object tied to exactly one Published source JSA Version.
- **Temporary JSA Number**: the non-operational identifier assigned while a JSA remains an unpublished Working Version.
- **Official JSA Number**: the immutable business number assigned atomically only when the first JSA Version is finally approved and Published.

## 3. JSA Master and version roles

A JSA Master provides continuity while its versions preserve change over time.

- A Master may have multiple historical versions but no more than one Current Version.
- A JSA Master may have at most one active Working Version.
- A Working Version is editable and is not operationally published content.
- A creator must be able to retrieve their own active Draft or Returned Working Versions and resume authoring after leaving the worksheet. This personal list remains subject to the user's active application permission and Site/Rig/Department data scope.
- New JSAs are not classified by Job Type. Creation captures Owner Site, Rig, Department, the effective Risk Matrix Version, and system-assigned English.
- Owner Site, Rig, and Department are governed ownership context selected when the JSA is created. The worksheet displays their business codes and names as read-only context; users do not edit raw identifiers or transfer this context from General Information.
- Location and Personnel are not part of the JSA General Information required or collected during creation or revision.
- A new JSA receives only a Temporary JSA Number during Draft and approval. That temporary value is replaced by the Official JSA Number only at initial publication.
- A Base Version identifies the version used to seed a Working Version and provides revision provenance.
- Updating a Published JSA requires checkout and creates a new Working Version; it does not edit the Current Version.
- Checkout prevents another user from creating or editing a competing Working Version for the same JSA Master.
- Checkout ownership and locking must not modify Current Published data.
- Undo Checkout is a privileged, audited action.
- The existing Current Version remains operative until a replacement completes approval and is published.
- Publishing the replacement makes it Current and makes the previous Current Version Superseded.

## 4. Published immutability and snapshot rules

- A Published version is immutable.
- Published content must never change because a referenced master record, workflow assignment, risk configuration, Position, Tool, or translation source later changes.
- A revision is represented by a new Working Version with a Base Version reference, not by mutation of published data.
- Version-owned relationships and display snapshots are preserved with the version.
- Historical Published and Superseded versions remain traceable and readable subject to permission and data scope.
- Publication is an explicit lifecycle event; approval alone must not silently mutate an existing Published version.

### Version comparison and change highlighting

- A Working Version created from a Published version must be compared with its Base Version.
- Logical keys preserve the identity of corresponding records across versions.
- Each comparison result is classified as **ADDED**, **MODIFIED**, **DELETED**, **MOVED**, or **UNCHANGED**.
- Comparison covers header fields, prompts, Tasks, Hazards, Controls, Initial and Residual Risk, Basic Job Steps, Performer Positions, Supervisor Positions, Tools, references, and attachments.
- Approvers must be able to identify changed content before approving an update.

## 5. Task, Hazard, and Control relationship

The confirmed relationship is:

```text
JSA Version
  -> one or more Tasks
       -> one or more Hazards per Task
            -> exactly one Control per Hazard
```

- A Hazard belongs to exactly one Task within a version.
- A Control belongs to exactly one Hazard within a version.
- A Task may contain multiple Hazards.
- A Hazard must contain exactly one Control. The Hazard and its Control form one assessment pair and cannot be created, saved, submitted, copied, or versioned independently.
- These records are version-owned snapshots and do not mutate equivalent records in another version.

### Hazard Assessment Prompts

- A JSA Version may select multiple Hazard Assessment Prompts.
- Prompt selections are snapshotted by version.
- Each prompt is a simple independent checkbox selection.
- A selected prompt does not require a mapping to a Task Hazard or Control.
- Prompt coverage mapping is not collected and does not block save or submission.
- The confirmed PV Drilling rig checklist contains: Hard hat; Disposable coverall; Use of ladder; MSDS; Well control procedures agreed; Gloves (heat resistant/other); Safety goggles; Fall protection/ Safety Harness; Gas test; Third party involved; Impact Glove; Safety shields; Signs/barriers; Rescue plan required; Fire-fighting equipment; Safety boots/shoe (rubber); Hearing protection; Environment Hazards Reviewed; Simultaneous operations (SIMOPS); Isolations required; Safety glasses; Dust mask; Weather reports discussed; Communication (Radio/Banksman); and Lifejacket/Work Vest.

## 6. Initial and Residual Risk

- Risk is assessed per Hazard, not once for the whole Task or JSA.
- **Initial Risk** represents the assessed risk before the Hazard's Controls are applied.
- **Residual Risk** represents the assessed risk after the selected Controls are applied.
- Residual Severity is inherited from Initial Severity for the same Hazard and cannot be adjusted independently. Only Residual Likelihood is reassessed after Controls.
- Initial Likelihood, Initial Severity, and Residual Likelihood are selected from the applicable Matrix definitions through reference popups rather than compact dropdowns. Selecting a reference row applies its governed Matrix level to the Hazard.
- Both values must be evaluated with the Risk Matrix applicable to the owning rig and version context.
- Controls must not erase or overwrite the Initial Risk assessment.
- The matrix identity and sufficient assessment inputs/results must be snapshotted so historical risk remains interpretable.

### Risk submission validation

- A submitted JSA must have at least one Task.
- Every active Task must have at least one Hazard.
- Every Hazard must have Initial Likelihood and Initial Severity, exactly one Control, and Residual Likelihood. Residual Severity must equal the Initial Severity.
- Risk Rating and Result are resolved from the applicable Matrix Cell and are not manually entered.
- All Hazards in one JSA Version use the same Matrix Version.
- Submission is blocked when Residual Risk is in a prohibited result category.
- Tolerable-risk escalation behavior remains configurable and is an open decision.

## 7. Basic Job Steps

Basic Job Steps form a separate ordered, versioned list. They are not substitutes for Tasks, Hazards, or Controls and must not be modeled as an implicit projection of the Task hierarchy.

- Each Basic Job Step belongs to one JSA Version.
- Step ordering is part of the version snapshot.
- Changes to a Working Version's Basic Job Steps do not alter Published or historical versions.
- Publication freezes the complete Basic Job Step list and its associations.

## 8. Basic Job Step associations

Each Basic Job Step supports:

- multiple Performer Positions;
- multiple Supervisor Positions; and
- multiple Tools.

These are separate many-to-many business associations. A Position may appear as a performer on one step and a supervisor on another. A Tool may be used by multiple steps. The associations belong to the JSA Version and must preserve step ordering and role meaning.

Submission requires all of the following:

- The JSA Version has at least one active Basic Job Step.
- Every Basic Job Step has a description.
- Every Basic Job Step has at least one Performer Position.
- Every Basic Job Step has at least one Supervisor Position.
- Every Basic Job Step has at least one Tool or an explicitly configured N/A value.
- The same Position or Tool cannot be associated more than once within the same step and role.
- Only active reference values within the user's permitted data scope may be newly selected.
- Historical snapshots remain visible even if their Position or Tool master record later becomes inactive.

## 9. Position and Tool snapshots

- Working Versions select Positions and Tools from the reference data available within their permitted scope.
- Publication stores the identifiers and display snapshots required to reproduce the Published version.
- Renaming, retiring, or otherwise changing a Position or Tool master record must not rewrite Published, Superseded, or other historical versions.
- Retired reference records remain visible where historically snapshotted but are not available for new selection unless a later confirmed rule explicitly permits it.
- A copied or revised Working Version resolves its own governed references while retaining provenance to its Base Version.

## 10. Rig-specific Risk Matrices

- Risk Matrices are rig-specific.
- A rig uses either an approved 3x3 matrix or an approved 5x5 matrix for the relevant JSA context.
- A JSA must use the matrix applicable to its owning rig; users must not substitute another rig's matrix merely because they can view or copy that JSA.
- Matrix dimensions, labels, thresholds, colors, and result categories are governed configuration rather than hard-coded universal rules.
- Each configured Risk Result may carry its governed name, semantic meaning, description, display color, operational guidance, and prohibited-Residual-Risk rule. JSA creation, revision, and approval review show the applied Matrix Version's Risk Colour Overview so users can interpret each configured result and required response.
- The JSA Risk Matrix block shows the Probability definitions, Severity definitions, matrix cells, and Risk Colour Overview together in one continuous view; users do not open a separate reference popup merely to interpret the matrix.
- The confirmed PV Drilling 5x5 Probability definitions are `1 — Very low / Rare`, `2 — Low / Unlikely`, `3 — Possible / Moderate`, `4 — Hight Likely`, and `5 — Almost Certain`.
- The confirmed PV Drilling 5x5 Severity definitions are `A — Slight`, `B — Minor`, `C — Moderate`, `D — Major`, and `E — Catastrophic`.
- Its four governed Risk Colour zones are Dark Green, Light Green, Yellow, and Red. Dark Green and Light Green require continuous improvement, Yellow requires risk reduction to ALARP, and Red requires additional controls, blocks Residual Risk acceptance, and requires Onshore Management consultation if the risk remains Red.
- The applied matrix/version must be snapshotted or otherwise historically resolvable for Published versions.
- Exact 3x3 definitions and governance for future Matrix-definition changes remain open business decisions.

## 11. Create and approval workflow

The confirmed approval sequence is:

```text
Creator
  -> Department Head
  -> STC
  -> OIM
  -> optional Rig Manager
  -> Published
```

- The Creator prepares and submits a Working Version.
- Each required approval stage must complete in sequence.
- A later stage cannot approve on behalf of an incomplete earlier stage unless a future confirmed delegation rule permits it.
- The Rig Manager stage is conditional; the exact condition is an open business decision.
- Successful completion of all required stages publishes the version and updates the Master's Current Version.
- Approval history, actor, decision, time, and comments must remain traceable independently of the current assignment.

### Workflow controls and final publication

- Only the current workflow assignee may execute an approval action.
- Return and Reject require a comment.
- Return retains the Working Version for correction and resubmission.
- While correcting a Returned Working Version, the creator must see the accumulated approval history on the same JSA screen, including cycle, action, actor, status transition, time, and comments from prior steps.
- Reject does not modify the Current Published version.
- An approver reviews the complete exact Working JSA Version and records Approve, Return, Reject, or Comment on one continuous Workflow Review screen. Approval must not require opening a separate JSA screen.
- Workflow step, role, assignee, actor, action, comment, previous state, next state, and timestamp remain traceable.
- Final publication is atomic: for an initially published JSA it assigns the Official JSA Number, makes the Working Version Published, updates `CURRENT_VERSION_ID`, and clears `WORKING_VERSION_ID` and checkout information. For a revision, it also makes the old Current Version Superseded.

## 12. Update, Return, Reject, Cancel, Superseded, and Retired

- **Update**: creates a Working Version based on an existing version, normally the Current Published version. The Current Version remains operative during revision.
- **Return**: sends an in-progress approval back for correction, retains the Working Version for resubmission, and does not change the Current Published version. A comment is required, and resubmission retains the prior decision history.
- **Reject**: ends or blocks the current approval attempt without modifying the Current Published version. A comment is required. Whether the same Working Version may be resubmitted is open.
- **Cancel**: stops an unpublished creation or revision process. It must not delete or mutate a Published version. Authorized actors and resumability are open.
- **Superseded**: identifies a formerly Current Published version replaced by a newer Published version. It remains immutable and historical.
- **Retired**: removes a JSA Master from normal future operational use while preserving all Published and historical versions. Retirement is not physical deletion.

No Return, Reject, Cancel, Supersede, or Retire action may erase approval history or version provenance.

## 13. Annual review

- Published JSAs are subject to annual review.
- A review record is distinct from editing the Published version.
- Last Review and Next Review are JSA lifecycle and scheduling metadata. They are stored on the JSA Master or derived from Review History; they are not fields of an immutable Published JSA Version.
- Every Review History record must reference the exact Published JSA Version that was reviewed and identify the reviewer, outcome, comments, and decision time.
- **NO CHANGE** creates a Review History record and updates or derives Last Review and Next Review without creating a new JSA Version or modifying the immutable Published JSA Version.
- **UPDATE REQUIRED** creates a Working Version, preserves the Current Published version, and follows the normal update approval workflow.
- Whether annual review may directly produce a Retired outcome is an open decision unless retirement has been separately initiated and authorized.
- Due-date calculation, reminder timing, grace periods, escalation, and the effect of an overdue review on operational use remain open decisions.

## 14. Translation lifecycle and OUTDATED printing

- Every source JSA is created and approved in English; the creator does not select a language.
- A Translation is a separate language-specific object tied to exactly one Published source JSA Version.
- The confirmed workflow is **OIM assigns -> Translator translates -> STC reviews and approves or returns -> Published**.
- Translation assignment, work, review, approval or return, and publication history remain traceable.
- A translation of the Current Published JSA remains valid while a replacement Working Version is being edited or approved.
- It becomes **OUTDATED** only after the replacement Working Version is finally Published and its source JSA Version is no longer Current.
- OUTDATED translations must be blocked from printing as current operational documents.
- Refreshing a Translation creates or updates translation work against the applicable source version and preserves prior translation history.
- Supported languages, SLA, fallback behavior, reassignment, and whether an OUTDATED translation remains historically viewable are open decisions.

## 15. Multi-site ownership and cross-rig copy

- Every operational JSA Master and version has explicit site ownership and rig context.
- The owning site is the authority for changes to its records.
- Users may act only within both their permission set and assigned data scope.
- Cross-rig copy creates a new destination-owned JSA; it must not create shared mutable content across rigs.
- A copy receives new local identities while retaining source-site, source-rig, source-JSA, and source-version provenance.
- The destination copy uses the destination rig's governed Risk Matrix and resolves destination-scoped Positions and Tools.
- Task, Hazard, and Control text may be copied.
- If the destination rig uses a different Risk Matrix, Initial Risk and Residual Risk values must be cleared.
- Before submission, every Hazard must be reassessed using the destination rig's Matrix Version.
- Source workflow history and approval status are never copied.
- Source Published and historical versions remain unchanged.
- Copy eligibility, field-by-field carry-forward rules, and required reapproval are open decisions.

## 16. Oracle sequence and GoldenGate business invariants

- Every replicated business table has an explicit primary key.
- Business identifiers use Oracle sequences; `MAX(ID) + 1` is forbidden.
- Draft and in-approval JSAs use only a Temporary JSA Number.
- Initial publication assigns the Official JSA Number in the format **`<Rig code>-<Department code>-NNNN`**.
- `NNNN` is a four-digit counter owned by the exact Rig/Department pair, beginning at `0001` and ending at `9999`.
- Counter allocation, final approval, publication, and replacement of the Temporary JSA Number occur in one transaction. The Rig/Department counter is locked so concurrent approvals cannot receive the same value.
- An Official JSA Number is immutable. Revisions and historical versions retain the same Official JSA Number owned by their JSA Master.
- Rig and Department codes are governed organization data. Administrators manage them through JSAMS with permission, data-scope, audit, optimistic-lock, hierarchy, and deactivate/reactivate controls; records are not physically deleted.
- Each site uses a non-overlapping sequence range.
- GoldenGate replicates source primary and foreign key values unchanged.
- A target site must not regenerate identifiers for replicated records.
- Sequence `NEXTVAL` state is not synchronized between sites.
- Site ownership travels with the business record and determines the authority to update it.
- A site must not update a record owned by another site unless a later confirmed business rule explicitly authorizes that operation.
- Physical deletion is avoided where audit history, lifecycle state, or replication conflict handling requires preservation.

Final site identifiers, sequence ranges, conflict-resolution rules, and GoldenGate topology remain open.

### Governed Attachment Library

- Attachments are optional supporting material for a JSA.
- Attachments are governed in a reusable library scoped to exactly one Site, Rig, and Department. Administrators may create nested folders within that fixed scope.
- Upload and replacement are administration actions requiring the dedicated Attachment Library permission and effective action scope. JSA creators do not upload files from the worksheet; they select from the active library for the JSA's exact Rig and Department.
- The JSA attachment picker is an Explorer view whose Site, Rig, and Department scope is locked to the JSA being created or revised. Creators navigate that governed folder tree and select exact file versions without changing scope, creating folders, uploading, or replacing files.
- File binaries are stored outside Oracle on the site's configured real or mapped filesystem. Oracle stores folder, logical asset, immutable file-version, checksum, size, content type, relative storage key, ownership, and association metadata.
- Binary synchronization between sites is performed by an approved third-party product. GoldenGate synchronizes attachment metadata only and never transfers file bytes.
- Replacing a library file creates a new immutable file version. It must not overwrite the previous binary or change an existing Published JSA Version.
- Each JSA attachment association identifies the exact immutable library file version selected. A historical JSA therefore retains the file version used when that JSA Version was authored, while a new Working Version may select the current library version.
- File selection and download require effective view scope for the attachment's Site/Rig/Department. Attachment administration additionally requires effective action scope.
- The initial governed file policy allows PDF, Microsoft Office document formats, JPG, and PNG, with a maximum size of 50 MB per file.

## 17. Enterprise authentication and JSAMS application users

Authentication and JSAMS authorization are separate:

```text
User submits enterprise username and password to JSAMS over TLS
  -> JSAMS validates the credentials against the internal Active Directory through LDAP
  -> JSAMS resolves the mapped active application user
  -> JSAMS evaluates application authorization
```

- Credential authority, password policy, password changes, account lockout, and account lifecycle remain owned by the enterprise Active Directory.
- JSAMS receives the password only for the duration of an LDAP login request and passes it to Active Directory for validation. It must never persist, hash, cache, audit, log, reproduce, or return that password.
- JSAMS does not create, change, reset, recover, lock, unlock, or otherwise administer enterprise passwords or Active Directory accounts.
- A **JSAMS application user** is the internal `SYS_USER` authorization representation of an existing enterprise identity; it is not a local-login account.
- The application user has a required, unique, canonical enterprise username, such as `phuclh`, for administration, assignment, display, lookup, audit, and operational processing.
- Active Directory `objectGUID` is the preferred stable link between the LDAP identity and `SYS_USER`. Username, email, and display name are distinct concepts; email and display name are profile attributes, not stable authorization keys.
- LDAP attribute mapping and accepted username forms must be environment-configurable. The confirmed Direct Bind forms are the submitted value, its normalized account name, `<account>@pvdrilling.com.vn`, and `PVDRILLING\<account>`; duplicate forms are removed. JSAMS must not apply any other account-name transformation without approval.
- Successful enterprise authentication does not provision or authorize a user automatically. The mapped `SYS_USER` must already exist, be active, and match the authenticated identity; an unregistered, inactive, or incorrectly mapped user is denied.
- Conversely, an active application user cannot enter JSAMS when Active Directory rejects the LDAP credentials.
- Deactivating a JSAMS application user blocks only JSAMS access. It does not disable, delete, unlock, or modify the corresponding enterprise account.
- Application roles, permissions, explicit user permission overrides, Site/Rig/Department data scopes, and workflow-role assignments are governed inside JSAMS unless a future confirmed synchronization rule states otherwise.
- Historical workflow and audit records retain the identity snapshots needed to remain understandable after later username, display-name, email, role, scope, or organizational changes.
- Enterprise user passwords must never appear in Oracle business/security data, logs, audit records, notification payloads, frontend storage, test fixtures, bootstrap inputs, or documentation. LDAP service-account credentials are deployment secrets, not business data.

## 18. Permission, workflow role, and data scope

JSAMS authorization evaluates these independent dimensions after successful enterprise authentication and active-user resolution:

- **Permission**: what action a user is allowed to perform, such as create, submit, approve, copy, review, translate, print, administer, or retire.
- **Workflow role**: why a user is eligible to act at a particular stage, such as Creator, Department Head, STC, OIM, or Rig Manager.
- **Data scope**: which sites, rigs, departments, and records the user may act upon.
- **Document state**: whether the requested action is valid for the JSA's current lifecycle state.
- **Current assignee**: whether the workflow task is assigned to this specific user now.
- **Owner-site rule**: whether the action is permitted for the record's owning site.

Having one dimension does not imply the others. An application role is not an Active Directory group; a permission is not a workflow role; a workflow role is not current assignment; and a role does not imply data scope. Frontend visibility is not authorization, and `SYSTEM_ADMIN` does not bypass required workflow or business checks unless an explicitly confirmed rule grants that behavior. The backend is the final enforcement boundary.

Effective permission precedence remains:

```text
Explicit user DENY
  -> Explicit user ALLOW
  -> Active role grant
  -> Default deny
```

For example, an active `phuclh` application user with role `JSA_APPROVER`, effective permission `JSA_APPROVE`, workflow role `STC`, and Site/Rig scope may approve only when enterprise authentication succeeds, the JSA is in scope and in an approvable state, the current step requires STC, and the current workflow task is assigned to that user. Any missing check denies the action.

## 19. Printing and historical versions

- Current operational printing uses a Published version.
- A Working, Returned, Rejected, or Cancelled version must not be printed as an approved operational JSA.
- An OUTDATED Translation is blocked from current operational printing.
- Published and Superseded historical versions remain printable only as explicitly identified historical records and subject to permission/data scope.
- A printed document must identify the JSA Master, exact version, status, owning site/rig, language, and print time sufficiently to prevent confusion with another version.
- The confirmed current-source JSA print form follows the supplied PV Drilling `JOB SAFETY ANALYSIS POLICY` layout with document reference `P1.04.09`: governed header/ownership metadata, Hazard Assessment Prompt checklist, Probability and Severity references, Risk Matrix and Risk Colour Overview, Task/Hazard/Control assessment, and Basic Job Step content are populated from the exact immutable Published Version.
- `PERSONAL INVOLVED`, its blank Name/Position/Company/Signature rows, the PTW suspension/stop-work note, and the complete Work Leader Debrief form are intentionally layout-only sections and do not load application data.
- JSAMS renders the form as HTML and invokes the browser print flow; PDF is produced through the browser's print/save-to-PDF capability rather than a separate server-side PDF document.
- Watermark text, copy numbering, completed paper signatures, offline validity, and print-audit retention remain open decisions.

## 20. Confirmed business rules

The following are confirmed:

1. A stable JSA Master owns version history, no more than one Current Version, and no more than one active Working Version.
2. Updating a Published JSA requires checkout; checkout prevents competing Working Versions without modifying Current Published content, and Undo Checkout is privileged and audited.
3. Published versions are immutable; updates use a Working Version with Base Version provenance while the Current Published version remains operational.
4. A Working Version based on a Published version is compared with its Base Version by logical identity, and changes are classified as ADDED, MODIFIED, DELETED, MOVED, or UNCHANGED for approver review.
5. Tasks contain multiple Hazards; every Hazard is paired with exactly one Control, and required Task, Hazard, Control, and risk fields are validated during save and submission.
6. Initial and Residual Risk are assessed per Hazard and resolved from one Matrix Version's cells. Residual Severity is locked to Initial Severity, only Residual Likelihood is independently reassessed, and prohibited Residual Risk blocks submission.
7. Hazard Assessment Prompts are independent checkbox selections snapshotted with the JSA Version. They do not require Task Hazard or Control coverage mapping, and coverage does not block save or submission.
8. Basic Job Steps are a separate ordered, versioned list with mandatory description, Performer Position, Supervisor Position, and Tool or configured N/A validation at submission.
9. Duplicate step-role Position or Tool associations are prohibited; only active, in-scope references may be newly selected while historical snapshots remain visible.
10. Position, Tool, risk, and other version-owned content snapshots preserve historical meaning.
11. Rigs use governed 3x3 or 5x5 Risk Matrices.
12. Cross-rig copy creates a new destination-owned JSA. If its Risk Matrix differs, Initial and Residual Risk are cleared and every Hazard is reassessed before submission; source workflow history and approval status are not copied.
13. JSA approval follows Creator -> Department Head -> STC -> OIM -> optional Rig Manager -> Published.
14. Only the current workflow assignee may act; Return and Reject require comments; full workflow state and action history remain traceable.
15. Return retains the Working Version for correction and resubmission, while Return, Reject, and Cancel do not modify the Current Published version.
16. Final publication atomically supersedes the old Current Version, publishes the Working Version, updates `CURRENT_VERSION_ID`, and clears `WORKING_VERSION_ID` and checkout information.
17. Retirement preserves history rather than physically deleting it.
18. Last Review and Next Review are JSA Master lifecycle/scheduling metadata or are derived from Review History. Every Review History record references the exact Published JSA Version reviewed. NO CHANGE records the review without creating or modifying a JSA Version; UPDATE REQUIRED creates a Working Version and follows the normal update workflow while preserving Current Published content.
19. Translation follows OIM assignment -> Translator translation -> STC approval or return -> Published.
20. A Translation remains valid while a replacement Working Version is in progress, becomes OUTDATED only after replacement publication, and cannot then be printed as current.
21. Site ownership, permission, workflow role, and data scope are independently enforced.
22. Replicated identifiers are sequence-generated at the owning site and preserved by GoldenGate.
23. Historical printing must identify the exact immutable version and status.
24. Enterprise credentials are validated by Active Directory through LDAP Direct Bind using the confirmed submitted/account/UPN/NetBIOS forms. JSAMS receives a password only transiently during login and never persists, hashes, caches, logs, audits, returns, or manages it.
25. A JSAMS application user is an internal `SYS_USER` representation of an enterprise identity, not a local-credential account, with a canonical enterprise username and Active Directory `objectGUID` as the preferred stable identity link.
26. Successful LDAP authentication alone does not grant JSAMS access. The mapped application user must exist, be active, and satisfy every applicable permission, override, data-scope, document-state, workflow-role, current-assignee, and owner-site check.
27. Application role, permission, explicit override, data scope, workflow role, and current assignment are independent; no dimension silently supplies another, and frontend visibility is never authorization.
28. Deactivating a JSAMS application user blocks JSAMS access only and never changes the corresponding Active Directory account.
29. Historical workflow and audit evidence preserves the identity snapshots needed to remain meaningful after later identity-profile or assignment changes.
30. New JSAs have no Job Type classification; Job Type is not requested or assigned during creation.
31. Every source JSA is created in English. Language is system-assigned rather than user-selected, and any non-English content follows the separate Translation lifecycle after source publication.
32. A creator can retrieve and resume their own active Draft or Returned Working Versions after leaving the worksheet, provided the records remain within the creator's effective application permission and data scope.
33. Draft and approval use a Temporary JSA Number. Initial publication atomically replaces it with an immutable Official JSA Number formatted `<Rig code>-<Department code>-NNNN`, where `NNNN` is the concurrency-safe `0001`–`9999` counter for that exact Rig/Department pair.
34. Rig and Department are governed, auditable organization data administered in JSAMS. Their parent hierarchy cannot be moved after creation, and deactivation is used instead of physical deletion.
35. JSA General Information displays Status as non-editable state and displays Owner Site, Rig, and Department by governed code and name rather than editable identifiers. Job Title is the only authored general-information text field. Job Description, Permit to Work selection/reference, Location, and Personnel are not collected as JSA authoring fields.
36. Procedure References are not collected during JSA creation or revision and their absence does not create a validation warning or block submission. Legacy Procedure Reference snapshots remain historical data but are not carried forward by current Working Version saves.
37. Attachments are optional and are selected from a governed library for the JSA's exact Site/Rig/Department scope; creators do not upload attachment binaries from the JSA worksheet.
38. Attachment binaries are stored on the configured site filesystem and synchronized by an approved third-party product. Oracle and GoldenGate contain and replicate metadata only.
39. Replacing a library attachment creates an immutable new file version. Every JSA attachment association retains the exact selected version so Published and historical JSAs never silently change content.
40. Workflow Review is a single continuous screen: the approver sees the complete exact Working JSA Version in read-only form and records Approve, Return, Reject, or Comment without opening a separate JSA screen.
41. The applied Matrix Version governs Probability and Severity definitions plus Risk Result meaning, description, display color, operational guidance, and any prohibited-Residual-Risk rule. Its Risk Colour Overview is visible during JSA creation, revision, and approval review.
42. The JSA Risk Matrix presents Probability definitions, Severity definitions, matrix cells, and Risk Colour Overview together in one continuous block; the row-level risk selectors remain the interaction used to choose Initial Probability, Initial Severity, and Residual Probability.
43. The confirmed PV Drilling 5x5 Matrix uses the five Probability definitions, five Severity definitions, four Risk Colour zones, and explicit 25-cell mapping recorded in the applied governed Matrix Version; a later material change creates a new version rather than rewriting a version already assigned or referenced.
44. The confirmed 25-item PV Drilling Hazard Assessment Prompt checklist is governed at Rig scope, presented as independent checkboxes, and snapshotted only when selected into a JSA Version.
45. The JSA attachment picker is an Explorer locked to the JSA's exact Site/Rig/Department. It supports governed folder navigation and exact-version selection only; library administration remains a separate permission and interface.
46. A Returned Working Version displays its complete accumulated approval history on the same correction screen, including prior Submit, Approve, Return, Reject, Publish, and Comment evidence where present; resubmission appends a new cycle and never replaces prior history.
47. A read-only JSA presents immutable content as readable static information. Authoring controls, selection controls, add/insert/delete actions, picker launchers, and editable-only table columns are not shown. The complete governed Hazard Assessment Prompt list remains visible with clear selected/not-selected state, while historical selected snapshots remain visible even if a Prompt is no longer in the current list; risk values, Position snapshots, Tool snapshots, and exact Attachment snapshots also remain clearly visible.
48. Current operational JSA printing is available only for the exact current Published source JSA Version. The approved HTML print form populates business content through Basic Job Step from that immutable Version; every section beginning with `PERSONAL INVOLVED` is an intentionally blank form layout for manual completion, and browser printing is the PDF-generation mechanism.

## 21. Open business decisions

The following require explicit business confirmation before implementation:

- exact conditions requiring Rig Manager approval;
- approval delegation, substitution, reassignment, and timeout/escalation rules;
- whether and how a Rejected Working Version may be reopened or resubmitted;
- who may Cancel, Retire, or reactivate a JSA and under what conditions;
- whether annual review may directly produce a Retired outcome;
- exact annual-review due-date, reminder, grace-period, and overdue behavior;
- final 3x3 and 5x5 matrix definitions, labels, thresholds, colors, and change policy;
- tolerable-risk escalation behavior;
- translation languages, SLA, fallback behavior, reassignment, and OUTDATED historical-view policy;
- cross-rig copy eligibility, carried fields, mapping failures, and mandatory reapproval;
- Position and Tool retirement/reactivation rules for new Working Versions;
- exact permission codes, organizational role mapping, data-scope rules, and emergency access;
- automatic first-login provisioning versus manual-only registration or governed synchronization;
- Active Directory group-to-JSAMS-role mapping and any HR/AD role synchronization;
- HR-to-user profile synchronization and display-name/email refresh frequency;
- username-change handling, domain-collision handling, and multi-domain identity rules;
- the transition plan for existing `SYS_USER` records that do not yet store Active Directory `objectGUID`;
- enterprise deprovisioning synchronization, including whether inactive enterprise accounts are detected only at login or by scheduled synchronization;
- workflow-role assignment ownership and approval;
- watermarking, completed signature handling, copy controls, offline validity, and print-audit retention;
- final site identifiers, non-overlapping sequence ranges, and GoldenGate conflict resolution;
- attachment binary synchronization SLA, monitoring ownership, retention, backup/restore, malware scanning, and recovery when metadata exists before the synchronized binary;
- data retention, archival, legal hold, and physical-deletion exceptions.

Until confirmed, these items must not be hard-coded as business behavior.
