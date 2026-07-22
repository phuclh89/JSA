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
- **Translation**: a separate language-specific object tied to exactly one Published source JSA Version.

## 3. JSA Master and version roles

A JSA Master provides continuity while its versions preserve change over time.

- A Master may have multiple historical versions but no more than one Current Version.
- A JSA Master may have at most one active Working Version.
- A Working Version is editable and is not operationally published content.
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
            -> one or more Controls per Hazard
```

- A Hazard belongs to exactly one Task within a version.
- A Control belongs to exactly one Hazard within a version.
- A Task may contain multiple Hazards.
- A Hazard may contain multiple Controls.
- These records are version-owned snapshots and do not mutate equivalent records in another version.

### Hazard Assessment Prompts

- A JSA Version may select multiple Hazard Assessment Prompts.
- Prompt selections are snapshotted by version.
- Every selected prompt must be reflected in a relevant Hazard or Control.
- Submission is blocked when configured prompt-coverage validation fails.

## 6. Initial and Residual Risk

- Risk is assessed per Hazard, not once for the whole Task or JSA.
- **Initial Risk** represents the assessed risk before the Hazard's Controls are applied.
- **Residual Risk** represents the assessed risk after the selected Controls are applied.
- Both values must be evaluated with the Risk Matrix applicable to the owning rig and version context.
- Controls must not erase or overwrite the Initial Risk assessment.
- The matrix identity and sufficient assessment inputs/results must be snapshotted so historical risk remains interpretable.

### Risk submission validation

- A submitted JSA must have at least one Task.
- Every active Task must have at least one Hazard.
- Every Hazard must have Initial Likelihood and Initial Severity, at least one Control, and Residual Likelihood and Residual Severity.
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
- The applied matrix/version must be snapshotted or otherwise historically resolvable for Published versions.
- The exact matrix definitions and rules for matrix changes remain open business decisions.

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
- Reject does not modify the Current Published version.
- Workflow step, role, assignee, actor, action, comment, previous state, next state, and timestamp remain traceable.
- Final publication is atomic: it makes the old Current Version Superseded, makes the Working Version Published, updates `CURRENT_VERSION_ID`, and clears `WORKING_VERSION_ID` and checkout information.

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
- Each site uses a non-overlapping sequence range.
- GoldenGate replicates source primary and foreign key values unchanged.
- A target site must not regenerate identifiers for replicated records.
- Sequence `NEXTVAL` state is not synchronized between sites.
- Site ownership travels with the business record and determines the authority to update it.
- A site must not update a record owned by another site unless a later confirmed business rule explicitly authorizes that operation.
- Physical deletion is avoided where audit history, lifecycle state, or replication conflict handling requires preservation.

Final site identifiers, sequence ranges, conflict-resolution rules, and GoldenGate topology remain open.

## 17. Permission, workflow role, and data scope

Authorization has three separate business dimensions:

- **Permission**: what action a user is allowed to perform, such as create, submit, approve, copy, review, translate, print, administer, or retire.
- **Workflow role**: why a user is eligible to act at a particular stage, such as Creator, Department Head, STC, OIM, or Rig Manager.
- **Data scope**: which sites, rigs, departments, and records the user may act upon.

Having one dimension does not imply the others. A user must satisfy the required permission, workflow-role eligibility, and data scope. Frontend visibility is not authorization; the backend is the final enforcement boundary. Exact permission codes, delegation, substitution, and role-to-organization mapping remain open.

## 18. Printing and historical versions

- Current operational printing uses a Published version.
- A Working, Returned, Rejected, or Cancelled version must not be printed as an approved operational JSA.
- An OUTDATED Translation is blocked from current operational printing.
- Published and Superseded historical versions remain printable only as explicitly identified historical records and subject to permission/data scope.
- A printed document must identify the JSA Master, exact version, status, owning site/rig, language, and print time sufficiently to prevent confusion with another version.
- Templates, watermark text, copy numbering, signatures, offline validity, and print-audit retention remain open decisions.

## 19. Confirmed business rules

The following are confirmed:

1. A stable JSA Master owns version history, no more than one Current Version, and no more than one active Working Version.
2. Updating a Published JSA requires checkout; checkout prevents competing Working Versions without modifying Current Published content, and Undo Checkout is privileged and audited.
3. Published versions are immutable; updates use a Working Version with Base Version provenance while the Current Published version remains operational.
4. A Working Version based on a Published version is compared with its Base Version by logical identity, and changes are classified as ADDED, MODIFIED, DELETED, MOVED, or UNCHANGED for approver review.
5. Tasks contain multiple Hazards, Hazards contain multiple Controls, and required Task, Hazard, Control, and risk fields are validated at submission.
6. Initial and Residual Risk are assessed per Hazard, resolved from one Matrix Version's cells, and prohibited Residual Risk blocks submission.
7. Hazard Assessment Prompt selections are version snapshots, must be reflected in relevant Hazards or Controls, and may block submission when configured coverage validation fails.
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

## 20. Open business decisions

The following require explicit business confirmation before implementation:

- final JSA numbering format and uniqueness scope;
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
- print templates, watermarking, signatures, copy controls, offline validity, and audit retention;
- final site identifiers, non-overlapping sequence ranges, and GoldenGate conflict resolution;
- data retention, archival, legal hold, and physical-deletion exceptions.

Until confirmed, these items must not be hard-coded as business behavior.
