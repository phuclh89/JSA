# Implementation log

## Unified JSA queue workspaces (2026-07-30)

- Applied the Published JSA ribbon, Department filter, keyword/search-field controls, dense selectable table, loading/error/empty states, and responsive horizontal table behavior to Needs Approval, Pending JSA, Rejected JSA, and My Drafts.
- Added shared `JsaListRibbon` and `JsaListFilters` components so queue action and filter behavior has one governed frontend implementation.
- Mapped only supported actions: Needs Approval provides Review JSA, View JSA, and Approval history; Pending JSA and Rejected JSA provide View JSA and Approval history; My Drafts provides Continue editing.
- Removed per-row action buttons from the standardized lists. Users select a row, then invoke the enabled ribbon action; double-click retains the primary open/review shortcut.

## JSA navigation order (2026-07-30)

- Reordered the JSA menu to: Published JSA, Needs Approval, Pending JSA, Rejected JSA, and My Drafts.
- Renamed the former Pending Approval navigation/page label to Pending JSA while retaining its existing route, governed count, query, and workflow semantics.

## Published JSA Create modal (2026-07-30)

- Removed Create JSA from the application sidebar and replaced the former standalone Create route with a compatibility redirect to Published JSA.
- Reused the governed Owner Site, Working Rig, Department, and effective Risk Matrix creation form inside an Ant Design modal opened by the Published JSA ribbon.
- Preserved the existing creation API boundary: only the three ownership identifiers are submitted. After creation, the same modal expands and replaces its ownership form with the complete single-screen Working Version worksheet without changing the Published JSA URL.
- Extended the draft editor to accept an explicit Draft ID and modal exit callback while preserving its existing route-driven and embedded read-only modes. Save, Cancel, Submit, and Exit retain their established behavior; modal completion returns to the unchanged Published JSA page.
- Removed the Effective Risk Matrix summary from the ownership-selection step while retaining the underlying Rig matrix query as the creation-readiness guard. The complete worksheet continues to display the applied Matrix.
- Changed the empty My Drafts action to return users to Published JSA, keeping Published JSA as the single creation entry point.

## Compact Published JSA heading (2026-07-30)

- Removed the visually redundant Published JSA eyebrow, title, and governed-scope description because the selected navigation item already supplies the page context.
- Retained a visually hidden `h1` so assistive technology still receives the page title without consuming visual layout space.
- Removed the redundant `Operations of JSA` caption row below the Published JSA action ribbon while retaining the ribbon's accessible region label.
- Moved the operations ribbon and data controls to the top of the page content.
- Reused the existing typography, spacing, and surface system while retaining the normal high-contrast text color; no business behavior, responsive breakpoint, shared component, or design-system rule changed.

## Global PV Drilling Tool catalogue (2026-07-30)

- Added the confirmed 53 Tool names in supplied display order at `GLOBAL` scope for Basic Job Step Tool selection across every Site/Rig.
- Added the required Global `JSA_TOOLS — JSA Tools` Tool Category, stable uppercase Tool codes, an idempotent Oracle seed, an exact verifier, repository commands, and static regressions.
- Existing active Tools matched by code or exact name retain their `TOOL_ID` and are moved into the governed category/scope; duplicate active scoped matches are soft-deactivated and historical Tool snapshots remain unchanged.

## Global PV Drilling Position catalogue (2026-07-30)

- Added the confirmed 35 Position names in supplied display order at `GLOBAL` scope for Basic Job Step Performer and Supervisor selection across every Site/Rig.
- Added stable uppercase Position codes, an idempotent Oracle seed, an exact verifier, repository commands, and static data regressions.
- Existing active rows matched by code or exact name are promoted in place to retain `POSITION_ID`; duplicate active scoped matches are soft-deactivated and historical Position snapshots remain unchanged.

## Global Hazard Assessment Prompt catalogue (2026-07-30)

- Promoted the confirmed 25-item Hazard Assessment Prompt catalogue from `PVD-I` Rig scope to `GLOBAL` scope so every active Rig resolves the same governed checklist.
- Preserved the existing Prompt IDs by updating the prior Rig-scoped rows in place; the idempotent seed soft-deactivates any duplicate active scoped copies before promotion.
- Removed the obsolete target-Rig seed requirement and strengthened the real-Oracle verifier to require the exact 25 labels/order at Global scope for all active Rigs.
- Prompt selections already snapshotted into JSA Versions remain exact historical evidence and are not rewritten.

## Confirmed PV Drilling Department codes (2026-07-30)

- Corrected the ten governed Department codes on every active Rig to `3P`, `DR`, `EL`, `ET`, `ME`, `MAR`, `MED`, `WE`, `CAT`, and `STC`.
- Updated existing Department rows in place by their previous/current code pair, retaining all 90 `DEPARTMENT_ID` values and dependent relationships rather than creating replacement rows.
- Updated official-number regression coverage to use the resulting `PV DRILLING V-DR-NNNN` format for Drilling.

## Official JSA number Rig-name segment (2026-07-30)

- Changed initial publication numbering from `<Rig code>-<Department code>-NNNN` to the confirmed `<Rig name>-<Department code>-NNNN` format.
- Publication now reads the governed `SYS_RIG.RIG_NAME` while retaining the concurrency-safe counter key on the exact Rig/Department identifiers.
- Official-number immutability, the `0001`–`9999` range, Temporary Draft/approval numbers, and the publication transaction are unchanged.
- No migration or existing-number rewrite was required; the development JSA dataset and number counter were already empty.

## Rig-scoped PV Drilling Department seed (2026-07-30)

- Added migration 013 and rollback to move Department-code uniqueness from Site scope to exact Site/Rig scope, enabling the same governed Department codes on different Rigs without allowing duplicates within one Rig.
- Added an idempotent seed and exact Oracle verifier for the confirmed ten-Department catalogue on all nine active Rigs.
- Preserved and updated the existing `PVD-I / DRILL` Department, then created 89 sequence-owned rows. The development database now contains exactly 90 active Rig-scoped Departments.
- No JSA, Site, Rig, Matrix, assignment, permission, workflow, attachment-library, or user-scope data changed.

## Development JSA reset and Rig Matrix assignments (2026-07-30)

- Added an explicitly confirmed, non-production-only reset command that removes all development JSA aggregates, workflow instances/tasks/actions, JSA notifications, exact-version attachment associations, and official-number counters without deleting attachment-library assets, master data, Matrix Versions, or Site/Rig records.
- The reset handles Published test data by temporarily disabling only the allowlisted JSA immutability triggers, commits the cleanup, and restores every trigger in `finally`; the independent verifier requires all 12 triggers to be enabled after execution.
- Removed 5 JSA Masters, 5 Versions (including 1 Published Version), 1 workflow instance, 5 workflow tasks, 8 workflow actions, 7 notifications/outbox records, 4 attachment associations, and the related authored aggregate rows. The JSA numbering counter was cleared so development numbering restarts from the governed initial value.
- Effective-ended the prior `PVD-I` assignment and assigned `DEV-5X5 / PVDRILLING-V2` to `PVD-V`. Assigned `PVD-3X3 / V1` to the other seven Offshore Rigs and Onshore `SHOREBASE`, producing exactly one current effective Matrix assignment for every active Rig.

## Confirmed PV Drilling Site/Rig hierarchy seed (2026-07-30)

- Added an idempotent Site/Rig governed-data seed and exact Oracle verifier for the confirmed Offshore and Onshore hierarchy.
- Corrected the existing `DEV` Site in place to `OFFSHORE` and `DEV-RIG` to `PVD-I / PV DRILLING I`, preserving Site ID `1000000`, Rig ID `1000000`, five JSA records, the existing Department, Matrix assignment history, Hazard Prompt scope, and user data scopes.
- Created Offshore Rigs `PVD-II`, `PVD-III`, `PVD-V`, `PVD-VI`, `PVD-VIII`, `PVD-IX`, and `PVD-X`, plus the `ONSHORE` Site and its `SHOREBASE` Rig, using source-site Oracle sequences.
- Updated the local environment identity from `DEV` to `OFFSHORE`. No JSA, workflow history, Matrix Version, Department, permission, role, or data-scope row was deleted or reassigned.

## PV Drilling 3x3 Risk Matrix seed (2026-07-30)

- Added an idempotent governed-data seed and exact Oracle verifier for the independent `PVD-3X3 / V1` Matrix Version based on Procedure Reference `P1.04.09`.
- Captured the supplied LOW/MED/HIGH Likelihood terminology; LOW/MED/HIGH Severity with separate injury, damage, and pollution definitions; all nine numeric ratings; and the white Acceptable, yellow Tolerable, and red Unacceptable results.
- Marked Unacceptable as prohibited for Residual Risk. The seed intentionally creates no Rig assignment and does not alter the current `DEV-5X5 / PVDRILLING-V2` assignment.

## Global JSA Working Rig context (2026-07-30)

- Replaced the page-local Published Rig filter with one persistent Working Rig selector in the JSA shell. The selection is stored per application user, prefers the user's governed default Rig, automatically selects a sole governed Rig, and otherwise supports `All governed rigs`.
- Applied the selected Rig server-side to My Drafts, Needs Approval, Pending Approval, Rejected JSA, Published JSA, and sidebar counts. Existing effective data-scope checks remain mandatory and prevent an arbitrary Rig identifier from widening access.
- Create JSA now inherits and locks Owner Site/Rig from a selected Working Rig; choosing a Rig from Create while in All-Rigs context updates the global context. Department remains selected within that Rig.
- Kept Administration outside the JSA Working Rig context because its governed configuration screens already expose explicit scope controls. No schema, migration, JSA ownership transfer, permission, workflow, or lifecycle rule changed.

## JSA sidebar queue counts (2026-07-30)

- Removed the duplicate folder-navigation panel from inside Published JSA; the existing application sidebar remains the single JSA navigation surface.
- Added governed counts to the outer sidebar labels for My Drafts, Needs Approval, Pending Approval, Rejected JSA, and Published JSA, for example `Published JSA (1)`.
- Added one compact read-only navigation-count endpoint using the same user ownership, workflow assignment, `CAN_VIEW`, effective-period, Site, Rig, and Department scope rules as the corresponding queues. It counts distinct JSAs without downloading every queue.
- Count cache is invalidated after create, cancel, submit, approve, return, reject, and comment success. No schema, migration, permission, workflow transition, or JSA lifecycle behavior changed.

## Legacy-familiar Published JSA workspace (2026-07-30)

- Redesigned only the Published JSA page around the confirmed legacy interaction model: a compact JSA operations ribbon, Department filter, keyword field selection, row selection, and a dense sortable Published list. Rig filtering is supplied by the later global JSA Working Rig context.
- Connected the ribbon exclusively to supported behavior: Create JSA, View JSA, Approval History, and Print JSA. Unsupported legacy features such as Favorite, Translation, Checkout, Delete, and Download Blank were not represented as working actions.
- Extended the existing governed workflow queue read model with Site, Rig, Department, publication timestamp, and final publishing username already stored in Oracle. No table, migration, write behavior, permission, workflow rule, or Published immutability rule changed.
- Preserved responsive access through horizontally reachable ribbon/table content, a stacked mobile folder/filter layout, keyboard focus treatment, textual labels, radio row selection, double-click viewing, and reduced-motion handling.

## JSA and Administration navigation areas (2026-07-30)

- Renamed the application shell's top-level `Browse` area to `JSA` and `Operations` area to `Administration`, including matching sidebar section labels and mobile navigation behavior.
- Removed the placeholder Browse Home page. Root, post-login, create-cancel, and recovery navigation now lead to `My Drafts`; the legacy `/browse` URL redirects there without rendering the removed placeholder.
- Moved System Health into Administration at `/operations/system-health`; the legacy `/system/health` URL redirects to the new route.
- Top-level tab selection now opens the first destination the signed-in user can actually access in that area instead of assuming Security Administration permission. Existing permission enforcement and JSA capability guards remain unchanged.

## Print Hazard Prompt checkbox borders (2026-07-30)

- Restored the bordered selection cell for every Hazard Assessment Prompt in the Published JSA print form, including unselected prompts, so the `X` marker and prompt label render as distinct legacy-form columns.
- Kept the existing five-column prompt layout, governed prompt data, selected state, print colors, and pagination behavior unchanged.

## Stable My Drafts table layout (2026-07-30)

- Removed the Ant Design fixed-right column and JavaScript-managed horizontal scrolling from `/jsa/drafts`; these combined features repeatedly measured and repainted the table and caused visible jitter.
- Added stable fixed-width column definitions, memoized column configuration, native overflow scrolling for narrow viewports, and a reserved loading/result area to prevent layout shifts while Draft data loads.
- Disabled scaling motion for dense table actions while retaining tokenized color/background feedback, consistent with the repository's dense-control and reduced-motion design rules.
- Disabled window-focus refetch for this creator-owned work queue so moving between the application and developer tools does not trigger an unnecessary Draft-list refresh. No API, authorization, workflow, or persistence behavior changed.

## Published JSA HTML print form (2026-07-30)

- Added a backend print-read endpoint that returns the exact current Published JSA Version under existing JSA view permission and data scope, and rejects Draft, Returned, active-approval, Rejected, and Cancelled states.
- Added immutable print metadata for JSA version number, language, and publication timestamp without changing the Oracle schema.
- Added a dedicated authenticated shell-free HTML print preview, Published-queue and Published-workflow print actions, browser Print/Save-as-PDF invocation, A4 landscape print CSS, repeated dense-table headers, page-break controls, and exact-version trace metadata.
- Recreated the confirmed PV Drilling `JOB SAFETY ANALYSIS POLICY` / `P1.04.09` form through Basic Job Step using real Published JSA snapshots. `PERSONAL INVOLVED`, manual signature rows, the PTW suspension note, and Work Leader Debrief are static blank layout only.
- No server-side PDF binary, file persistence, print audit, copy numbering, watermarking, or new permission code was introduced.

## Read-only JSA static presentation (2026-07-29)

- Replaced disabled authoring controls on read-only JSA worksheets with readable static presentation for the complete governed Hazard Assessment Prompt list and its selected/not-selected state, Matrix risk selections, performer/supervisor Position snapshots, Tool snapshots, and no-tool state. Historical selected Prompt snapshots remain visible if absent from the current governed list.
- Removed edit-only actions and structure from read-only rendering: add/insert/delete buttons, `Del` columns, assignment and attachment pickers, attachment removal, validation/save/cancel/submit actions, and disabled checkboxes.
- Preserved selectable read-only authored text and immutable snapshot values. No API, authorization, workflow, persistence, or schema behavior changed.

## Returned JSA approval history on correction screen (2026-07-29)

- Added a reusable Approval History component shared by the active Workflow Review screen and the editable Returned JSA correction screen.
- Returned creators now see the complete accumulated workflow evidence on the same one-screen worksheet: action, actor username, cycle, from/to status, timestamp, and required Return/Reject comments.
- Added explicit loading, empty, and recoverable error states plus responsive wrapping, semantic time elements, textual action/status labels, and readable comment treatment. Embedded read-only worksheets do not duplicate the parent review screen's history.
- Reused the existing governed workflow-detail API and immutable `JSA_WORKFLOW_ACTION` evidence; no schema, migration, or workflow transition changed.

## Accurate API startup port diagnostics (2026-07-29)

- Preserved the original safe startup error message instead of replacing every non-recognized startup failure with a generic Oracle configuration hint.
- Added specific `EADDRINUSE` and `EACCES` guidance so a duplicate API instance or operating-system port restriction is not misdiagnosed as an Oracle client/account problem.
- Reproduced the reported startup failure and confirmed that PID `24072` already owned port `3000`; the existing API and Oracle readiness endpoints both remained healthy. No running process was stopped.

## Submitted JSA attachment readback fix (2026-07-29)

- Corrected the Oracle Draft aggregate mapper to return `LIBRARY_ASSET_VERSION_ID` as `libraryAssetVersionId` for every active `JSA_VERSION_ATTACHMENT`.
- The persisted attachment association was already version-owned and preserved during workflow submission; the missing API field caused the read-only workflow worksheet to filter the attachment out after loading.
- Added a repository regression that verifies the immutable Attachment Library version identifier and attachment metadata survive Oracle-row-to-API mapping. No schema, migration, workflow transition, or attachment versioning rule changed.
- Follow-up inspection of affected UAT JSA `1000102` showed two association rows were soft-deactivated by a second aggregate save from the old running API/client state immediately before submission. They were not silently reactivated during active approval because that would bypass the confirmed workflow immutability rule; recovery requires Return, re-selection under the corrected API, and resubmission.

## Rig-scoped Explorer attachment picker (2026-07-29)

- Replaced the flat attachment checkbox modal in the one-screen JSA worksheet with a familiar Explorer layout: governed folder tree, breadcrumb navigation, current-folder filtering, folder cards, file cards, exact version labels, selected count, and clear empty/loading/error states.
- Locked the picker context to the JSA's existing Site, Rig, and Department. The visible scope is read-only, the picker request carries all three identifiers, and returned folders are defensively restricted to the same identifiers before rendering.
- Preserved exact immutable Attachment Library version selection. Creating folders, uploading, and replacing files remain exclusive to the separate Attachment Library administration interface.
- Added responsive stacking for narrow screens, keyboard-focus styling, semantic folder buttons, accessible tree/navigation labels, and explicit attachment checkbox labels.

## Confirmed PV Drilling Hazard Assessment Prompt seed (2026-07-29)

- Added an idempotent Rig-scoped seed containing the exact 25 Hazard Assessment Prompt labels and visual order confirmed from the legacy JSAMS checklist.
- Seeded all 25 prompts for `DEV-RIG` (`RIG_ID=1000000`) with Oracle sequence-owned IDs and soft-deactivated the three superseded global development fixtures (`Hazardous energy`, `Dropped objects`, and `Pinch points`) instead of deleting them.
- Added a real-Oracle verifier for exact code/label/order and effective scope, plus static regressions for the full list and unique stable codes. No migration or Oracle object change was required.

## Scoped development JSA test-data cleanup (2026-07-29)

- Added a guarded development cleanup command that targets JSA aggregates by exact creator username and removes only their version children, workflow runtime rows, JSA-targeted notifications/outbox rows, Versions, and Masters in dependency order.
- The command refuses production, requires an explicit username-matching confirmation, refuses Published target Versions, runs in one Oracle transaction, and verifies that no target JSA remains before commit.
- Executed the cleanup for `phuclh`: removed 5 Draft Masters, 5 Versions, 1 workflow instance/task/action, 1 notification/outbox pair, and their exact prompts, Tasks, Hazards, Controls, Basic Job Step assignments, and attachment association.
- Post-cleanup verification found zero JSA Masters for `phuclh` and four JSA Masters belonging to other users, confirming the cleanup did not broaden to other creators. Configuration and reference data were untouched.

## Confirmed PV Drilling legacy 5x5 Matrix seed (2026-07-29)

- Added a reusable, idempotent Oracle seed for the confirmed Probability and Severity terminology, four Risk Colour meanings/guidance rows, and the explicit 25-cell legacy mapping.
- Preserved Matrix history by creating `DEV-5X5 / PVDRILLING-V2` instead of updating assigned `DEV-V1`; the prior Rig assignment was effective-ended and the new version was assigned atomically to Rig `1000000`.
- Allocated the Matrix Version, axis, result, cell, and assignment identifiers from their governed Oracle sequences so site-range and GoldenGate invariants remain intact.
- Added static seed regressions and a real-Oracle verifier that checks the exact terminology, Risk Colour metadata, active assignment, and all 25 cells.

## Complete legacy-style Risk Matrix layout (2026-07-29)

- Reworked the one-screen JSA Risk Matrix into the familiar four-part reference view: inline Probability definitions, inline Severity definitions, the governed matrix cells, and Risk Colour Overview are now visible together.
- Restored the legacy matrix orientation labels with `SEVERITY` spanning the matrix columns and `PROBABILITY` displayed vertically beside the likelihood rows.
- Removed the separate Probability/Severity information buttons and their reference-only modal from the Matrix heading. The row-level selection popups for Initial Probability, Initial Severity, and Residual Probability remain unchanged.
- Added semantic reference tables and a horizontally reachable dense layout for narrower viewports. All labels, definitions, cells, colors, guidance, and prohibited rules continue to come from the exact applied Matrix Version; no hard-coded business values, API contract, migration, or Oracle object was added.

## Matrix Risk Colour Overview in the JSA worksheet (2026-07-29)

- Expanded the Risk Matrix legend in the one-screen JSA worksheet into a labeled `RISK COLOUR OVERVIEW` that displays each configured Risk Result's name, semantic meaning, description, operational guidance, color, and prohibited-Residual-Risk warning.
- Reused the existing Matrix Version contract and the existing `JSA_RISK_RESULT` metadata (`DESCRIPTION`, `SEMANTIC_CATEGORY`, `DISPLAY_COLOR`, `GUIDANCE_TEXT`, and `PROHIBITED_FLAG`). The Risk Matrix administration editor already owns Semantic Meaning, Color Metadata, and Guidance entry, and the Draft API already resolves the exact applied Matrix Version.
- Explicitly displays `Guidance not configured` when governed guidance is absent so missing configuration is visible rather than silently omitted. No new table, migration, Oracle object, API contract, or hard-coded color meaning was introduced.

## Clear prohibited Residual Risk legend (2026-07-29)

- Replaced the ambiguous inline `Prohibited residual` tag with a structured warning card inside the exact configured Risk Result legend row.
- The warning now uses a semantic danger icon, the explicit heading `Not allowed as Residual Risk`, and the recovery instruction `Reduce the risk before submitting for approval.` The associated result row also receives a restrained danger-tinted background, so the warning is visibly tied to that result rather than appearing as another legend category.
- Preserved configuration-driven behavior: only Risk Results whose matrix configuration has `prohibited = true` show the warning. Backend submission validation, Risk Matrix values, and persistence behavior are unchanged.

## Readable JSA read-only fields (2026-07-29)

- Replaced disabled text-field presentation with native read-only semantics for Job Title, Task, Hazard, Control, and Basic Job Step text/number fields whenever a JSA cannot be edited.
- Read-only fields now retain near-black selectable text on the approved light-surface background instead of inheriting Ant Design's low-opacity disabled treatment. Editing remains blocked, while users can focus, select, and copy JSA content.
- Buttons, checkboxes, risk selectors, assignment pickers, and destructive actions remain disabled when the document is read-only. No authorization, document-state, API, workflow, or persistence behavior changed.

## Single-screen Workflow Review (2026-07-29)

- Embedded the complete exact Working JSA Version directly in Workflow Review so an approver can review General Information, Hazard Prompts, Risk Matrix, Tasks/Hazards/Controls, Basic Job Steps, Attachments, and validation evidence without leaving the approval page.
- Forced the embedded worksheet to read-only and removed the separate `Open read-only JSA` navigation action. The existing Approve, Return, Reject, and Comment controls remain on the same page and stay visible while scrolling on desktop.
- Reused the JSA worksheet component in an embedded mode that suppresses duplicate authoring controls, save/submit actions, alerts, and approval-progress headers. Mobile keeps the action card in normal document flow.
- Added regression coverage for the single-screen composition and read-only boundary. No API contract, migration, Oracle object, permission, workflow transition, or publication rule changed.

## JSA approval progress bar (2026-07-29)

- Added a reusable approval-status bar at the top of the one-screen JSA worksheet and Workflow Review screen. It presents Creator, the effective configured approval steps, and Published as a familiar directional sequence.
- The bar resolves its approval steps from the existing workflow preview instead of hard-coding the optional route. Rig Manager therefore appears only when the effective JSA workflow includes that step; resolved assignee names appear beneath configured steps.
- Added distinct text, icon, and color treatment for completed, current, upcoming, Returned, Rejected, Cancelled, and Published states. The route remains horizontally reachable on narrow screens and does not rely on color alone.
- Reused the approved centralized palette and added the existing documented warning/danger semantic colors as CSS variables. No workflow, API, migration, Oracle, permission, or approval business rule changed.

## Governed Attachment Library (2026-07-29)

- Reworked Attachment Library administration into a Rig-level file explorer. The scope toolbar now stops at Site and Rig; accessible Departments appear as governed virtual root folders, nested attachment folders appear in a keyboard-operable tree, and the selected location displays folder/file cards with breadcrumb navigation and current-folder filtering.
- Kept Department data scope and storage ownership unchanged behind the Explorer presentation. Create Folder uses the selected Department/folder location, while Upload remains available only inside a persisted attachment folder; no API, migration, Oracle object, filesystem, or GoldenGate behavior changed.
- Corrected Attachment Library query bind sanitization so optional DTO properties never leak into Oracle folder or asset queries. `folderId` is now passed only to the filtered asset query when a folder is actually selected, preventing `ORA-01036` on the initial scoped page load and picker.
- Added Site/Rig/Department-scoped nested folders, reusable logical assets, immutable file versions, SHA-256 metadata, exact-version JSA associations, and dedicated site-ranged Oracle sequences in migration 012.
- Added the `attachment-library` API with permission/data-scope enforcement, mapped-filesystem atomic writes, governed file policy, versioned replacement, exact-version download, and audit events.
- Added the Attachment Library administration screen and replaced manual JSA attachment metadata entry with an exact-scope library picker. Attachments remain optional.
- Confirmed the deployment boundary: an external third-party product synchronizes binary files between site filesystems, while GoldenGate replicates Oracle metadata only.
- Added a dedicated attachment sequence bootstrap, schema verification, repository/service regressions, and ADR-007.
- Applied migration 012 to the configured Oracle environment, configured all three attachment sequence ranges for Site `1000000`, and verified the resulting schema. The first apply exposed and removed one redundant index definition before the clean reapply.

## Removed Procedure Reference authoring (2026-07-29)

- Removed the Procedure References card and its master-data query from the single-screen JSA worksheet; the remaining Attachment Metadata card now uses the full section width under the simplified `ATTACHMENTS` heading.
- Normalized Procedure References to an empty collection in both frontend serialization and the API save boundary, so current Working Version saves cannot reintroduce hidden references and inherited legacy rows are deactivated.
- Removed the no-Procedure-Reference validation warning. The historical Oracle table and read contract remain available for old version interpretation; no migration or Oracle object change was required.

## Matrix-backed risk selection popups (2026-07-29)

- Replaced the compact dropdowns for Initial Likelihood, Initial Severity, and Residual Likelihood with keyboard-accessible reference popup triggers in each Hazard row.
- Each popup lists the active levels from the Draft's captured rig-specific Matrix Version using Category and Definition columns, highlights the current value, and applies the selected governed level immediately.
- Centered the risk-selection popup against the viewport instead of using the library's fixed top offset, keeping the decision surface visually anchored on desktop and smaller screens.
- Preserved Residual Severity as a disabled value inherited from Initial Severity. Risk result/rating resolution and save payload structure remain unchanged; no API, migration, or Oracle object change was required.

## Simplified JSA General Information and Hazard Prompt selection (2026-07-29)

- Reduced authorable JSA General Information to Job Title. Job Description, Permit to Work selection, and PTW reference are no longer rendered, accepted by Draft save DTOs, or written by the Draft repository.
- Retained the legacy Oracle columns and historical read contract for backward compatibility; current Draft saves leave any historical Job Description/PTW values untouched, so no migration or Oracle object change was required.
- Changed Hazard Assessment Prompts to independent one-click checkbox selections. The worksheet no longer presents or submits Task Hazard coverage mappings, selected prompts do not require coverage validation, and aggregate saves clear any legacy prompt-coverage rows.
- Added frontend and API regression coverage for the narrowed header contract, one-click prompt behavior, empty coverage persistence, and continued validation of prohibited residual risk.

## Professional LDAP sign-in presentation (2026-07-28)

- Reworked the LDAP sign-in page into a responsive two-region enterprise entry experience: a restrained PV Drilling/JSAMS identity and product-context panel plus a focused authentication panel with clearer hierarchy, larger controls, and a single primary action.
- Preserved all authentication behavior and security boundaries: credentials still go only to the LDAP login API, the password field is cleared after each attempt, no browser storage is introduced, and unregistered, inactive, unavailable-service, validation, and loading states remain visible.
- Added centralized design tokens for existing approved neutral, mint, light-surface, and white-surface roles; the login page reuses the repository palette, ring elevation, spacing, radii, accessible labels, visible focus treatment, reduced-motion handling, and the approved PV Drilling logo.
- Added a compact mobile layout below the established `768px` breakpoint while retaining the richer product-context panel on tablet, desktop, and large screens. No business, API, LDAP, or database behavior changed.

## Atomic JSA Draft save and conflict recovery (2026-07-24)

- Replaced the worksheet's two-request Header-then-Content save sequence with one aggregate `PUT /jsa-drafts/:id/save` operation.
- The API now updates Header and Content inside the same Oracle transaction. The Version row value passed to Content is the deterministic successor of the Header value; any header, aggregate, validation, or optimistic-lock failure rolls the complete save back.
- Corrected structural reference validation to enforce uniqueness within each aggregate entity type rather than across unrelated types. Independent Oracle sequences can legitimately produce the same numeric ID for a Task, Hazard, Control, Basic Step, Position snapshot, or Tool snapshot; those IDs now remain valid while duplicates inside the same type still fail closed.
- Preserved the narrower Header and Content endpoints for compatibility, but the JSAMS worksheet no longer uses them for Save Draft.
- Added a guarded one-time recovery for Draft screens carrying root row versions from a legacy partial save. The client fetches the latest aggregate and retries with its current root versions only when the loaded business baseline and every persisted child row-version fingerprint still match; it preserves the user's unsaved values and never retries a genuine concurrent business edit.
- Added a specific `Reload latest` recovery action for genuine optimistic conflicts. It explicitly warns that unsaved screen changes will be discarded before refetching the current server version.
- A controlled real-Oracle probe executed Header and Content in one transaction and then mandatorily rolled it back. The affected Draft remained at Master row version `4`, Version row version `6`, and child row version `1`, confirming that the current aggregate path succeeds and the reported repeat conflict came from stale screen metadata.
- Added API transaction-order and frontend single-request/conflict-recovery regression coverage. No migration or Oracle object change was required.

## PV Drilling branding and neutral section bars (2026-07-24)

- Added the supplied approved PV Drilling logo as a repository-owned frontend asset and applied it to the application shell and LDAP sign-in screen while retaining the JSAMS product name.
- Replaced the black application header with a clean white surface and dark text/actions so the supplied white-background logo integrates naturally. JSA worksheet section bars use the centralized warm dark gray `#454745` token instead of black.
- Added accessible logo alternative text, responsive logo sizing, and frontend regression assertions for both branded entry points.

## JSA General Information clarity (2026-07-24)

- Replaced editable-looking General Information inputs for Status, Temporary JSA Number, Owner Site, Rig, and Department with semantic read-only presentation. Draft/Returned state is rendered as a badge, and ownership context is shown using governed code and name rather than numeric IDs.
- Extended Draft detail retrieval to join the exact Site/Rig/Department hierarchy and return display codes/names through the shared contract.
- Removed Location and Personnel from the worksheet, Draft header request contract, and update SQL. Existing nullable Oracle columns are retained and left untouched for historical compatibility; no migration or database object change was required.
- Added focused API and frontend regression coverage for hierarchy-safe display metadata, the absence of editable raw ownership identifiers, and the absence of Location/Personnel authoring fields.

## Official JSA numbering and organization administration (2026-07-24)

- Separated Draft/approval Temporary numbers from immutable Official JSA numbers. Initial publication now allocates `<Rig code>-<Department code>-NNNN` inside the final approval transaction.
- Added migration/rollback 011 with `JSA_MASTER.NUMBER_STATUS`, the concurrency-safe per-Rig/Department `JSA_NUMBER_COUNTER`, hierarchy constraints, bounded `0001`–`9999` values, and an Official-number immutability trigger.
- Added governed Rig and Department administration APIs/screens under Operations. They enforce SYSTEM_ADMIN, independent data scope, active Site/Rig hierarchy, required audit, optimistic locking, immutable parent ownership, and deactivate/reactivate behavior.
- Relabeled Draft UI values as Temporary numbers while Published queues continue to display the Official number.

## Personal JSA Draft retrieval (2026-07-24)

- Added a governed `My Drafts` API that returns only the authenticated creator's active Draft or Returned Working Versions within effective `CAN_VIEW` Site/Rig/Department data scope.
- Added the `My Drafts` navigation entry and responsive list screen with JSA number, job, state, ownership context, last update, empty/error/loading states, and a direct action to continue the worksheet.
- Changed Draft cancellation completion and `Exit` navigation to return to `My Drafts`, so a saved Working Version remains discoverable without entering an approval queue.
- Added shared contracts and focused backend/frontend regression coverage. No migration or database object was required because the query uses existing JSA Master, Working Version, ownership, and security-scope data.

## English-only unclassified JSA creation (2026-07-24)

- Removed Job Type and Language from the Create JSA screen and API input. New source JSAs are unclassified by Job Type and the screen explains that English is assigned automatically.
- Hardened the Create JSA submission boundary to construct an explicit three-field payload (`ownerSiteId`, `rigId`, and `departmentId`). Removed fields retained by an open Ant Form during hot reload can no longer be submitted and rejected as non-whitelisted request data.
- Exposed safe validation messages and correlation IDs in the Create JSA error alert and API structured logs. Request validation failures now identify the rejected field/rule without logging submitted values.
- Runtime diagnosis identified a stale API process that had held port 3000 since before the Create-JSA DTO change and still required `jobTypeId`. The exact listener was replaced with a new `@jsams/api` development process from current source; no frontend or Oracle data change was needed.
- Replaced generic Draft-save failure feedback in development with persistent, actionable diagnostics: API error code/message, safe detail lines, Oracle code when available, and correlation ID. Unknown production errors remain generic, while structured server logs retain the real internal message for support diagnosis.
- The API now resolves exactly one active `SYS_LANGUAGE` record with code `EN`, fails closed on missing or ambiguous configuration, and preserves the assigned language during later Draft header saves.
- Added migration/rollback 010. The migration retains historical Job Type values, permits null Job Type for new versions, requires source language, and enforces active English through `TRG_JSA_VERSION_ENGLISH`.
- Applied migration 010 to the development Oracle schema and extended schema verification for column nullability, trigger validity, migration state, and invalid source-language absence.
- Added focused frontend and Oracle-repository regression tests for the no-selection UI and server-owned English assignment.

## JSA Draft save correction (2026-07-24)

- Corrected new aggregate inserts in the Oracle JSA Draft repository. Insert branches now omit update-only `rowVersion` binds, preventing `ORA-01036`, and Task/Basic Job Step number binds use non-reserved `taskNumber`/`stepNumber` names, preventing `ORA-01745`.
- Corrected the Draft header update bind set as well: `rowVersion` belongs to the subsequent JSA Master update and is no longer passed to the `JSA_VERSION` statement, eliminating the observed `ORA-01036: unrecognized bind variable rowVersion`.
- Added a repository regression test that exercises a complete new Draft aggregate: prompt, Task, Hazard, Control, prompt coverage, Basic Job Step, performer/supervisor Positions, Tool, procedure reference, and attachment.
- Reproduced the original failure against Draft `DEV-1000000-1000007`, then verified the corrected header/content sequence on the real development Oracle schema inside an explicitly rolled-back transaction. No diagnostic business rows were retained.
- `docs/state.md`, `docs/database-schema.md`, and `docs/DESIGN.md` were reviewed and not changed because this correction changes neither business behavior, schema, nor the design system.

## LDAP authentication and administrator enablement (2026-07-23)

- Locked each Hazard's Residual Severity to its Initial Severity in the single-page editor; changing Initial Severity synchronizes both values and the Residual S selector is disabled. Draft save, business validation, workflow submission, and migration 009 enforce the same invariant; migration 009 was applied and verified on the development Oracle schema.
- Enforced the confirmed one-to-one Hazard/Control rule throughout JSA drafting. Every new Hazard now owns one Control editor; independent add/remove-Control actions were removed; draft save/validation and workflow submission reject zero or multiple Controls.
- Added migration/rollback 008 with a fail-closed duplicate-data preflight and a function-based unique index that prevents more than one active Control per Hazard. Applied it to the development Oracle schema and extended general schema verification to check migration history, index validity, and duplicate absence.
- Rebalanced the single-page Task/Hazard/Control grid with explicit column sizing: long-text Task/Hazard/Controls columns are wider while P/S/R and delete columns are compact. Corrected the last-hazard delete behavior so the containing Task is removed instead of silently rendering a replacement blank hazard.
- Corrected assessment numbering to identify Tasks only as `1`, `2`, `3`, and so on. Additional Hazards within the same Task no longer receive misleading sub-numbers such as `1.2`.
- Removed the redundant editable Task-number input. Task numbers and display order are now derived and resequenced after add, insert, or delete; each Task exposes a `+ Task` action that inserts a new Task immediately below it.
- Added a production-blocked, transactional, idempotent full-approval UAT seed and verifier. The configured test user receives all active permissions through `SYSTEM_ADMIN`, Site-wide Department Head/STC/OIM/Rig Manager assignments, and an active four-step `UAT_FULL_APPROVAL` workflow/binding with audited changes.
- Corrected the post-login Oracle assignment lookup to bind a concrete effective timestamp instead of an untyped null inside `COALESCE`, eliminating `ORA-00932` for registered users while preserving effective-period filtering.
- Replaced the runtime service-account-first flow with the confirmed configurable Direct Bind strategy. Login now tries the submitted, normalized account, UPN, and NetBIOS forms, then reads the exact canonical identity and `objectGUID` through the authenticated connection. The optional service-search strategy remains available.
- Replaced the uncompleted OIDC integration path with the confirmed internal Active Directory LDAP architecture. Added exact escaped directory lookup, service-account bind, user-DN credential validation, `objectGUID` mapping, fail-closed LDAP/environment validation, and production rejection of unencrypted LDAP.
- Added signed, time-limited `HttpOnly`/`SameSite=Strict` JSAMS session cookies, active `SYS_USER` resolution on every request, login/logout endpoints, and a responsive LDAP login screen that never persists credentials in browser storage.
- Added ADR-005 and aligned business state, architecture, deployment, README, and environment examples with the confirmed LDAP decision. Diagnosis found that the Domain Controller's LDAPS endpoint uses a legacy signature algorithm rejected by default Node/OpenSSL policy. Local UAT now uses LDAPS 636 with an explicit legacy-TLS compatibility flag; production rejects that flag and requires a current trusted certificate.
- Added the idempotent `db:seed:ldap-admin` operational script. It resolves the approved `phuclh` Active Directory identity and `objectGUID`, uses the existing Site and `SYSTEM_ADMIN` Role, creates/aligns `SYS_USER`, assigns Site `VIEW/ACT`, and records immutable access-administration audit events without creating or storing a password.
- Executed the approved seed on the development Oracle schema. `phuclh` is active with stable AD identity mapping, active `SYSTEM_ADMIN`, active Site `VIEW/ACT`, and three seed audit events; the repeat invocation returned `SKIPPED`.

## Phase 4.5 — User Access Administration and Approval UAT Enablement (2026-07-23)

- Added migration/rollback 007 with append-only access-administration audit, its explicit `NUMBER(19)` sequence, Site-range bootstrap/startup validation, immutable audit trigger, query indexes, and missing workflow step/role/actor/assignee snapshots. Existing evidence is backfilled and later profile/assignment changes do not rewrite it.
- Made ordered OIDC identity, username, display-name, and email claims configurable. Added explicit username normalization, allowlisted domain stripping, production-required immutable identity mapping, production-disabled username fallback, and deterministic collision rejection.
- Added the `access-administration` modular slice with `SYSTEM_ADMIN` guards, user lifecycle, custom Role lifecycle, existing Permission catalogue, Role/User/Permission/override/scope/workflow-role assignments, optimistic locking, hierarchy validation, effective-access evaluation, exact Phase 4 approver preview, UAT readiness, pending-task stranding protection, and transactional durable audit.
- Added protected administration routes/screens for application-user registration/detail, governed assignments, Roles/Permissions, Effective Access, Pending Impact, Approver Resolution, UAT Readiness, and read-only Access Audit. There are no credential, password-reset, directory-administration, provisioning, synchronization, or impersonation features.
- Applied migration 007 on the development Oracle schema, corrected a PL/SQL delimiter exposed by non-transactional DDL, performed controlled rollback/reapply, configured only the audit sequence range, and verified snapshots/audit on Oracle. No production user, Role, Permission, scope, workflow assignment, approver, definition, or binding was seeded.
- `docs/state.md` was reviewed and not changed because implementation introduced no newly confirmed business decision. `docs/DESIGN.md` and `docs/AGENTS.md` were reviewed and not changed because no durable design-system or documentation-governance rule changed.

## Phase 4 — Approval Workflow and Initial Publishing (2026-07-23)

- Added migration/rollback 006 with versioned definitions, ordered steps, approved-dimension bindings, independent workflow-role assignments, instances/tasks/actions, notification/outbox records, publication metadata, nine sequences, and Published immutability triggers.
- Added deterministic unique-assignee preview, submit/resubmit, approve, return, reject, comment, queues, configuration/role-assignment APIs, atomic initial publication, and fail-closed production conditions.
- Kept permission, workflow eligibility, and data scope independent. Return retains the Working Version and instance with a new resubmission cycle; Reject is terminal; active approval cannot be cancelled.
- Integrated Save & Submit into the one-screen editor and added Needs Approval, Pending, Rejected, Published, workflow review/history/action, and administration screens.
- Added Phase 4 sequence bootstrap/startup validation and real-Oracle verification. No production code, route, assignee, or Rig Manager condition was invented.
- `docs/state.md` was not changed because no business decision was newly confirmed.

## Phase 3 — JSA Draft Core (2026-07-23)

- Added migration/rollback 005 with JSA Master, Draft Version, prompt/coverage, Task/Hazard/Control, independent risk snapshots, Basic Job Steps and snapshot assignments, procedure snapshots, attachment metadata, logical keys, optimistic versions, composite same-version FKs, and explicit sequences.
- Added controlled Phase 3 sequence bootstrap and startup range validation. No Site/range, permission, numbering, reference, or JSA seed was added.
- Added modular `jsa-draft` backend: fail-closed capabilities, governed numbering, atomic create, creator/scope edit enforcement, immutable ownership, aggregate upsert/soft-deactivate, exact matrix-cell resolution, structured validation, cancellation, audit events, and attachment storage port.
- Added shared contracts and responsive `/jsa/new` plus `/jsa/:id/draft` UI with all Phase 3 sections and states. Approval submission is disabled with a Phase 4 explanation.
- Reworked the JSA Draft editor into one continuous worksheet to preserve the legacy system's familiar data-entry model. General information, Hazard Assessment Prompts, the configured Risk Matrix, Task/Hazard/Control assessment, Basic Job Steps, references, attachments, validation, and draft actions now appear together without a tab workflow.
- Added compact P/S/R risk columns, Probability and Severity definition dialogs, configured Matrix lookup/legend, responsive horizontally scrollable operational tables, and dual-list dialogs for Performer Position, Supervisor Position, and Tool selection. The presentation keeps the confirmed multi-Hazard, multi-Control, separate Basic Job Step, snapshot, and server-derived risk rules unchanged.
- Added schema, validation, capability-route, and transaction-rolled-back real Oracle behavior tests.
- `docs/state.md` was not changed: implementation followed existing confirmed behavior; permission codes, numbering policy, takeover, and storage remain open decisions.
- `docs/DESIGN.md` was not changed: existing palette, spacing, radii, breakpoints, interactions, accessibility, and reduced-motion rules were reused; no reusable design rule was introduced.

## Phase 0 — 2026-07-22

Added root workspace/tooling configuration; shared API/auth types and permission constants; NestJS config, Oracle, health, system, auth, logging, correlation, error handling and Swagger; React providers, shell, routing, guards, API client and health UI; Oracle migration SQL and status/up/down runners; CI and technical documentation.

Technical choices: pnpm workspaces, Zod startup validation, one lifecycle-managed Oracle pool, `AsyncLocalStorage` correlation context, development-only code-configured users, direct SQL with SHA-256 migration checksums, and public operational health endpoints.

Deferred: all business modules and schema, production OIDC/hosting/deployment, GoldenGate, storage, notification, and final site/sequence decisions. Known limitation: real Oracle verification depends on credentials and an accessible instance; Oracle DDL is non-transactional.

## Phase 0A — 2026-07-22

Added one-time Thin/Thick Oracle client initialization, client-path checks, safe Oracle/NJS diagnostics, `oracle:diagnose`, `oracle:readiness`, opt-in `oracle:test`, real-pool integration tests, migration Thick initialization, explicit development rollback confirmation and schema/service checks, PL/SQL/slash/CRLF-aware migration parsing tests, and a DBA-reviewed development-schema example. Updated environment validation, root/database documentation, architecture, state, deployment policy, testing log, and ADR.

The existing one-pool mandatory-startup policy is preserved. No business module/table was added and no credential was placed in source.

Real execution fixes: root `db:up` collided with pnpm's built-in update command and now delegates through `pnpm run`; Nest and Vite now resolve the monorepo-root `.env`; Nest development startup uses the Nest compiler instead of esbuild-based `tsx` so decorator metadata is preserved. Added `db:verify` and reusable real API smoke with graceful `app.close()`.

Real verification completed against `JSA_APP@PDBAPPS`: Oracle 23.0.0.0.0, Thick Client 23.9, migration lifecycle, checksum guard, controlled rollback/reapply, HTTP health, repeated readiness, pool close, and integration transaction cleanup. Frontend visual browser inspection remained unavailable because the in-app browser had no active session.

## Phase 1 — 2026-07-22

Added immutable migrations 002/003 and matching rollbacks for the Oracle site/security foundation: 11 `SYS_*` tables, one `NUMBER(19)` sequence per table, named PK/FK/UK/check constraints, hierarchy and authorization indexes, function-based uniqueness for active assignments, governed site ranges, soft revocation, optimistic row versions, and GoldenGate-stable identifiers. Migration 003 preserves applied-migration immutability while aligning final unique-index names with repository conventions.

Added a deployment-configured Phase 1 bootstrap that refuses missing, invalid, undersized, or overlapping ranges; configures only allowlisted sequences; and creates only the confirmed system permissions, administrator role/user mapping, and site scope. It was intentionally not executed because final site identity, range, and administrator identity remain unconfirmed business/deployment inputs. With `LOCAL_SITE_ID` configured, startup validates active per-sequence range overlap and local sequence position.

Added the security modular-monolith slice: enterprise principal extraction, Entra-compatible OIDC JWT/JWKS validation, development identity hints that still resolve through `SYS_USER`, active-user enforcement, transactional Oracle repository resolution, string ID handling, role permissions, deterministic DENY/ALLOW overrides, view/action data scopes, permission and scope guards, structured required security audit boundary, safe Oracle constraint mapping, and original-error-preserving transaction rollback. `GET /api/v1/auth/me` returns only normalized non-sensitive session context.

Replaced code-configured frontend users with asynchronous session bootstrap, explicit unauthenticated/unregistered/inactive states, in-memory token-provider integration, protected routes, centralized permission-aware navigation, Access Denied handling, and a responsive Browse/Operations shell. The shell follows the repository design system with its near-black/lime palette, pill interactions, rounded ring surfaces, and mobile navigation behavior. Phase 2+ JSA features and operational administration CRUD were not added.

Real Oracle verification applied migration 002, verified 11 tables/sequences and `NUMBER(19)` keys, rolled 002 back while retaining migration 001, and reapplied it. Migration 003 was then applied, rolled back, reapplied, and verified. API startup initially exposed a missing module export; after correction, real Oracle health, repeated readiness, and graceful pool shutdown passed.

## Phase 2 — 2026-07-22

Added immutable migration 004 and its isolated rollback for eight governed master-data catalogues plus the versioned Risk Matrix model: 15 tables, 15 `NUMBER(19)` sequences, scoped active-code uniqueness, relational Site/Rig/Department hierarchy, Tool Category ownership, typed System Parameters, explicit 3×3/5×5 axes/results/cells, mixed textual code namespaces, effective-dated Rig assignments, audit columns, and optimistic row versions. No production master data or Matrix values were seeded.

Added transactional NestJS `master-data` and `risk-matrix` slices with repository ports and Oracle adapters. The APIs provide searchable/paginated catalogue administration, safe deactivation/reactivation, typed parameter validation, Matrix/version/configuration CRUD, completeness validation, lookup preview, immutable assigned versions, serialized Rig overlap checks, exact effective-version resolution, required security audit calls, `SYSTEM_ADMIN` authorization, and independent Rig data-scope enforcement.

Added responsive administrator pages for every Phase 2 catalogue, Matrix/version list, full axis/result/cell editor, lookup-driven preview/legend, incomplete-state messaging, and Rig assignment management. Tool editing selects a real active Tool Category. Navigation and direct routes use the existing centralized permission model and design-system tokens.

Added a deployment-only Phase 2 sequence bootstrap, real-Oracle transactional behavior verifier, schema/unit tests, backend mixed-code/completeness/parameter tests, and frontend administration/preview tests. Migration 004 was applied, verified, rolled back in isolation, and reapplied on the confirmed development schema. Phase 1 business bootstrap, Phase 2 sequence bootstrap, official catalogue data, and official Rig Matrix configuration remain intentionally unexecuted because their approved environment/business inputs were not supplied.

## Phase 5 — 2026-07-30

Implemented controlled Published JSA checkout and replacement across migrations 014/015, the new `jsa-versioning` module, existing Draft/Workflow repositories, shared contracts, and React workspaces. Checkout now locks the Master and creates a complete physical snapshot with stable logical keys, exact attachment references, Base lineage, Matrix-change reassessment, checkout identity, and an atomic Working pointer. Undo Checkout cancels the Working Version only when no active approval task exists.

Added deterministic on-demand Base/Working comparison for header, prompts and coverage, tasks, hazards/risk, controls, basic steps, assignments, tools, procedures, and attachments. The UI supplies summary counts, changes-only/type/section filters, inline before/working values, moved/deleted treatment, version history, owner checkout metadata, and embedded approver comparison.

Extended final workflow approval so a revision reuses the official number, marks the old Current Version `SUPERSEDED`, publishes the Working Version, advances the Current pointer, and clears checkout state atomically. Operational detail and print continue to resolve only the Current Published pointer. Update, Compare/History, and Undo Checkout are independently mapped and fail closed as a group when configuration is partial.

The Oracle migration chain was applied, verified, rolled back through 015 and 014, verified in the prior state, and reapplied. A verification failure exposed invalidated child immutability triggers after procedure replacement; migration 015 now recompiles all dependencies and hardens immutable creation evidence during supersession.

## Phase 6A/6B — 2026-07-30

Implemented one `jsa-browse` API/repository contract for Published, Favorites, All JSAs, My Drafts, Needs Approval, Pending, and Rejected. The contract validates explicit search-field/filter enums, NUMBER(19) identifiers, ISO dates, minimum search length, bounded page size, and allowlisted sorting before Oracle receives bound values. SQL applies effective view scope, queue ownership/current-assignee semantics, separate Current/Working visibility, exact Current Published semantics, stable ID tie-breaking, and matched field/version-kind metadata.

Added `/jsa/all` and `/jsa/favorites`, migrated operational list routes to the shared server-paged React workspace, retained the global Working Rig as a narrowing filter, and extended the existing ribbon/filter/table interaction. Structured filters cover Site, Rig, Department, official and Working status, Matrix Version, risk result/stage, Creator, Publisher/Approver, active update, Favorite state, and created/published/updated ranges. Favorite remains a selected-row ribbon action rather than a per-row action.

Migration 016 adds one soft-state Favorite row per User/JSA Master, explicit Site-ranged sequence allocation, provenance/audit/row-version fields, lookup indexes, and targeted browse indexes. Favorite writes require independently configured view and Favorite permissions, view scope, and a valid Current Published Version; they are idempotent and emit structured security audit logs only on state change. No Permission or grant is seeded.

The first Oracle apply failed before history recording because a browse index referenced a Master-owned creator column on `JSA_VERSION`. The partial Oracle DDL was compensated, the index corrected, and migration 016 applied. Its rollback was then extended to remove sequence-range registration; the complete rollback, reapply, bootstrap, and verification chain passed.

## Phase 6C — Cross-Rig Copy (2026-07-30)

- Added migration/rollback 017 for immutable copy provenance, exact source/destination Version lineage, actor-scoped persisted idempotency, source/time indexes, and a Site-ranged sequence. Rollback refuses any schema containing provenance rows.
- Added fail-closed `jsa-copy` capabilities and APIs for destination discovery, authoritative preflight, transactional copy, idempotent retry, and provenance. View/Create/Copy permissions and source VIEW/destination ACT scope remain independent; `SYSTEM_ADMIN` is not an implicit substitute.
- The copy creates a new Master and Version plus new physical IDs/logical keys, remaps approved worksheet relationships and stable reference codes, and excludes official numbering, coverage, procedures, workflow/evidence, favorites, notifications, and attachments/binaries.
- Exact Matrix-Version equality preserves validated risk; different Matrix Versions clear all risk for reassessment. Missing/ambiguous Position or required Tool mappings block; prompt gaps warn and require acknowledgement.
- Added a ribbon-only Copy flow for Published/Favorites/All, responsive destination/preflight/confirm UI, post-success destination worksheet opening, and durable Copied-from provenance presentation.
- Applied 017 on Oracle after correcting a PL/SQL delimiter exposed by non-transactional DDL, then completed controlled rollback/reapply, Site bootstrap, full schema verification, and rolled-back behavior verification. No speculative Permission, grant, organization, Matrix, or reference data was seeded.
- `docs/state.md` was not updated for Phase 6C: the conservative limitations above implement this phase safely and do not settle the broader open business decisions.
# Phase 7 — Translation Management (2026-07-30)

- Added migration 018 and fail-closed rollback for Translation header, structured CLOB segments, append-only actions, sequences, indexes, hashes, status checks, and immutable final/source evidence.
- Added the `jsa-translation` Nest module with fail-closed permission mappings, OIM/Translator/STC eligibility, local ownership and scope enforcement, assignment/refresh, Translator and STC lifecycle, queues, history, notifications/outbox, and current-source print checks.
- Integrated replacement publication so all Translations of the superseded source are atomically Outdated with replacement linkage, assignee clearing, actions, and notifications.
- Added the `/jsa/translations` workspace, assignment ribbon/modal, side-by-side editor/reviewer, status/history views, navigation counts, responsive layout, and browser HTML print. Translation queues use scoped server-side pagination, escaped JSA Number/Job Title search, status filtering, allowlisted sorting, stable ID tie-breaking, and do not load segment detail per row.
- Added Phase 7 bootstrap, schema/unit tests, real Oracle rolled-back verifier, environment documentation, and shared contracts. No production business seed was added.
