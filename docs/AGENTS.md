# Coding rules

- Keep a modular monolith with Controller → Application Service → Domain → Repository Interface → Oracle Repository dependencies.
- Put SQL only in repository or infrastructure classes. Use bind variables for every value; never concatenate user input.
- Application services own transaction boundaries. Infrastructure helpers own connection cleanup, not domain decisions.
- Expose Oracle `NUMBER(19)` identifiers as JSON strings. Never use JavaScript `number` for them and never use `MAX(ID)+1`.
- Future tables use explicit Oracle sequences with site-specific, non-overlapping ranges. Replicated IDs are preserved; targets do not regenerate them.
- Do not hard-code workflows, risk matrices, or permission behavior outside the authorization framework.
- The frontend is not a security boundary. Backend guards enforce authorization and data scope.
- Every migration requires rollback. Never edit an applied migration; add a new migration.
- Implement only the active phase. Update `implementation-log.md` and `testing-log.md` at every phase boundary.
- Treat `state.md` as the current business source of truth. Update it only when confirmed business behavior, lifecycle rules, domain relationships, roles, permissions, ownership rules, or business decisions change; do not use it for technical implementation or test status.

## Frontend design-system compliance

- `docs/DESIGN.md` is the normative source of truth for frontend visual language, colors, typography, spacing, component appearance, interaction states, layout, responsive behavior, and reusable visual patterns.
- Any task that creates or modifies frontend UI, a user workflow, layout, responsive behavior, visual styling, navigation, forms, grids, tables, or reusable visual components MUST read `docs/DESIGN.md` completely before editing code and MUST demonstrably comply with every applicable rule.
- Confirmed business behavior, authorization requirements, security, accessibility, usability, operational clarity, and functional correctness take precedence over purely visual styling. A visual rule must never hide required business information, weaken authorization, remove necessary state explanation, or make a workflow inaccessible.
- Do not introduce another palette, type scale, spacing scale, radius system, shadow style, button pattern, interaction convention, or breakpoint when an approved applicable rule exists.
- Reuse centralized design tokens, theme variables, responsive patterns, and shared components. Do not scatter duplicated CSS magic numbers. Before creating a component or style, inspect the current theme and shared components and extend the existing reusable pattern when appropriate.
- Frontend visibility is not authorization. Permission-aware display must remain consistent with backend authorization, data scope, and document-state validation.

### Required UI state coverage

New or materially modified UI must implement and verify every applicable state: default, hover, active, focus-visible, disabled, loading, empty, validation error, system error, read-only, permission denied, and unavailable because of document state. A state may be omitted only when it is genuinely inapplicable, not merely because it is inconvenient to implement or test.

### Responsive and accessibility verification

- Verify all applicable supported layouts from `docs/DESIGN.md`: mobile, tablet, desktop, and large screen.
- Check keyboard navigation, visible focus, readable contrast, semantic structure, accessible names, text wrapping, long Vietnamese and English labels, content overflow, text zoom, reduced-motion preferences, tables and dense operational layouts, modal and drawer behavior, disabled-action explanations, and responsive navigation.
- Visual imitation must not override accessibility, safety-critical visibility, or operational clarity.

### Design-system deviations

Do not silently deviate from `docs/DESIGN.md`. When an explicit task requirement, confirmed business behavior, accessibility, usability, or genuine technical limitation requires a deviation:

1. Identify the conflicting design rule.
2. Explain why the deviation is necessary.
3. Apply the smallest necessary deviation.
4. Reuse the closest approved token or component.
5. Update `docs/DESIGN.md` only if the design-system rule itself has intentionally changed.
6. Report the deviation in the final task report.

If the conflict cannot be resolved without changing a design-system rule and that change is not explicitly authorized, stop and request confirmation instead of inventing a new pattern.

## Documentation map and reading rules

Documentation is part of the deliverable. Read the minimum set for the task before changing code, schema, configuration, tests, or documentation, and keep every affected source of truth consistent in the same task.

### Documentation map

| File                                                       | Purpose                                                                                                                                                                                                         | Read when                                                                                                                                                                                             | Update when                                                                                                                                                                                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                                                | Repository entry point: product summary, prerequisites, local setup, and primary developer commands.                                                                                                            | On first contact with the repository, when onboarding, or when setup and top-level commands are relevant.                                                                                             | The supported prerequisites, setup path, repository layout, or primary commands change.                                                                                                                                |
| `docs/AGENTS.md`                                           | Mandatory engineering, coding, and documentation-governance rules for contributors and agents.                                                                                                                  | At the start of every task, before any repository change.                                                                                                                                             | A durable coding rule, contribution rule, documentation responsibility, or reading rule changes.                                                                                                                       |
| `docs/state.md`                                            | **JSAMS Business State** and the current source of truth for scope, terminology, lifecycle, statuses, domain relationships, roles, permissions, ownership, and confirmed or open business decisions.            | A task touches business behavior, domain meaning, workflow, status transitions, authorization, data scope, ownership, translation, printing, review, versioning, risk, or cross-site behavior.        | Only confirmed business behavior or a confirmed business decision changes, or an open business decision is added, resolved, or materially refined. Never record build, test, migration, or implementation status here. |
| `docs/architecture.md`                                     | Current system architecture, module boundaries, dependency direction, integrations, runtime responsibilities, and cross-cutting technical design.                                                               | A task changes or depends on application structure, APIs, integrations, security boundaries, runtime behavior, or a cross-cutting design.                                                             | The intended architecture, component responsibility, integration, or material technical constraint changes.                                                                                                            |
| `docs/database-schema.md`                                  | Oracle conventions and the current logical and physical database model, including identifiers, relationships, constraints, sequences, and GoldenGate-relevant design.                                           | A task touches persistence, SQL, repositories, migrations, schema objects, identifiers, data relationships, Oracle behavior, or replication.                                                          | The intended or implemented database model or Oracle convention changes. Business meaning must first remain consistent with `docs/state.md`.                                                                           |
| `database/README.md`                                       | Operational guidance for database migrations, rollback, migration-runner behavior, and SQL file conventions.                                                                                                    | Creating, reviewing, running, or troubleshooting migrations or database bootstrap work.                                                                                                               | Migration mechanics, execution instructions, rollback conventions, or database tooling change.                                                                                                                         |
| `docs/implementation-log.md`                               | Chronological, phase-by-phase technical implementation history, delivered scope, and known technical limitations. It is historical evidence, not a current business specification.                              | Resuming work, determining what has already been implemented, planning a phase, or investigating implementation history.                                                                              | At every phase boundary and whenever a material implementation increment changes phase status or its recorded limitations. Do not rewrite history to describe current business rules.                                  |
| `docs/testing-log.md`                                      | Commands run and test, build, migration, connection, and verification evidence, including pass, fail, skip, and environment qualifications.                                                                     | Verifying work, assessing regression evidence, preparing a release, or making a claim about validation status.                                                                                        | At every phase boundary and after each material verification run whose result is relevant to project evidence. Record exact commands and outcomes without secrets.                                                     |
| `docs/deployment.md`                                       | Environment configuration, application startup, deployment, migration execution, operations, and production-readiness procedures.                                                                               | A task concerns configuration, environments, secrets handling, startup, deployment, monitoring, operations, or production rollout.                                                                    | A supported environment variable, deployment procedure, runtime prerequisite, operational check, or production process changes.                                                                                        |
| `docs/DESIGN.md`                                           | Normative JSAMS design-system source for frontend presentation and interaction: visual language, colors, typography, spacing, components, states, layout, responsiveness, accessibility, and reusable patterns. | Any frontend code or bug fix affecting presentation or interaction; user workflow, visual, shared-component, theme, responsive-layout, navigation, form, grid/table, or accessibility-sensitive task. | Only when an intentional, confirmed design-system rule, token convention, or reusable pattern changes. Implementing one screen does not by itself justify updating the design system.                                  |
| `docs/decisions/0001-phase-0-foundation.md`                | Accepted foundation ADR covering the baseline Phase 0 technology and structural decisions.                                                                                                                      | A task depends on, extends, or proposes changing a Phase 0 foundation decision.                                                                                                                       | Its status or supersession metadata changes. Preserve the accepted decision as historical evidence; record a replacement in a new ADR.                                                                                 |
| `docs/decisions/ADR-002-oracle-client-mode.md`             | Accepted ADR for the Oracle client-mode decision and its trade-offs.                                                                                                                                            | A task touches Oracle driver mode, client requirements, or proposes a different connection approach.                                                                                                  | Its status or supersession metadata changes. Use a new ADR for a replacement decision.                                                                                                                                 |
| `docs/decisions/ADR-003-permission-override-precedence.md` | Accepted precedence for explicit user DENY/ALLOW, role grants, and default deny.                                                                                                                                | A task changes RBAC resolution, permission overrides, or effective-permission behavior.                                                                                                               | Its status or supersession metadata changes. Use a new ADR for a replacement decision.                                                                                                                                 |
| `docs/decisions/ADR-004-site-sequence-range-validation.md` | Accepted bootstrap and fail-closed validation strategy for site-specific Oracle sequence ranges.                                                                                                                | A task changes site bootstrap, identifier allocation, range validation, or GoldenGate-safe sequence behavior.                                                                                         | Its status or supersession metadata changes. Use a new ADR for a replacement decision.                                                                                                                                 |
| `docs/decisions/*.md`                                      | Durable architectural decision records: context, decision, consequences, and supersession history.                                                                                                              | A task touches a subject governed by an ADR or proposes a durable cross-cutting technical decision.                                                                                                   | A durable technical decision is accepted, superseded, or has a formal status change. Never silently rewrite an accepted decision.                                                                                      |

When a new repository documentation file is introduced, add it to this map in the same change.

### Minimum required reading set by task type

`docs/AGENTS.md` is mandatory for every task. Add the following minimum set according to the task; if a task spans categories, combine their sets.

| Task type                                                                                                                                                 | Additional minimum reading                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Business analysis, domain behavior, workflow, statuses, roles, permissions, ownership, printing, translation, or versioning                               | `docs/state.md`; also `docs/architecture.md` when translating the rule into system behavior.                                                                                            |
| Backend, API, or application-service change                                                                                                               | `docs/architecture.md`, the relevant parts of `docs/state.md`, and `docs/database-schema.md` when persistence is involved.                                                              |
| Frontend implementation, presentation/interaction bug fix, screen, workflow, component, navigation, form, grid/table, responsive, or accessibility change | Read `docs/DESIGN.md` completely, plus `docs/state.md` and `docs/architecture.md`; inspect the relevant theme, shared components, API, and authorization implementation before editing. |
| Oracle, repository, SQL, migration, sequence, or GoldenGate change                                                                                        | `docs/database-schema.md`, `database/README.md`, `docs/architecture.md`, relevant ADRs, and `docs/state.md` when business data or lifecycle semantics are affected.                     |
| Authentication, authorization, workflow role, or data-scope change                                                                                        | `docs/state.md` and `docs/architecture.md`, plus `docs/database-schema.md` if persisted assignments or scopes change.                                                                   |
| Deployment, configuration, environment, or operations change                                                                                              | `README.md`, `docs/deployment.md`, `docs/architecture.md`, and any relevant ADR.                                                                                                        |
| Bug diagnosis or regression investigation                                                                                                                 | `docs/implementation-log.md`, `docs/testing-log.md`, and the owning source of truth: `docs/state.md`, `docs/architecture.md`, `docs/database-schema.md`, or `docs/deployment.md`.       |
| Phase planning, phase completion, or release verification                                                                                                 | `docs/implementation-log.md`, `docs/testing-log.md`, and every normative document affected by the phase.                                                                                |
| Documentation-only change                                                                                                                                 | The target document and every document whose authority overlaps the edited subject. For this file, also inspect the actual documentation tree so the map remains complete.              |

### Source-of-truth precedence

Use the most specific authoritative source for the subject. The following order resolves authority; a lower item cannot silently override a higher one:

1. Current explicit, approved requirements for the task.
2. `docs/state.md` for business meaning, lifecycle, roles, permissions, ownership, and confirmed business decisions.
3. An accepted, non-superseded ADR for the specific durable technical decision it governs.
4. `docs/database-schema.md`, `docs/architecture.md`, `docs/deployment.md`, and `docs/DESIGN.md` within their respective database, system-design, operational, and frontend-design scopes.
5. `docs/AGENTS.md` for repository engineering and documentation-governance rules.
6. Application code, tests, and migrations as evidence of what is currently implemented or deployed, not as authority to redefine confirmed business behavior.
7. `docs/implementation-log.md` and `docs/testing-log.md` as historical and verification evidence.
8. `README.md` and other summaries as entry points that must defer to the specialized source of truth.

Within the same authority level, prefer the more specific document and then the newer explicitly superseding decision. External system, developer, security, and compliance instructions still take precedence over repository documentation.

For frontend presentation, visual components, interaction states, and responsive behavior, `docs/DESIGN.md` is authoritative unless it conflicts with a current explicit requirement, confirmed business behavior, security, authorization, accessibility, or usability. It does not override `docs/state.md` within the business-behavior scope.

### Resolving conflicts between code and documentation

- If code or tests contradict a confirmed rule in `docs/state.md`, treat the implementation as potentially defective. Do not edit the business rule merely to legitimize current code. Fix the implementation only when the task authorizes it; otherwise report the conflict.
- If code differs from `docs/architecture.md` or `docs/database-schema.md`, inspect the relevant migrations, tests, history, and ADRs to distinguish stale documentation from an incomplete or incorrect implementation. Reconcile all authorized affected artifacts in the same task.
- If frontend code contradicts `docs/DESIGN.md`, treat it as potentially inconsistent; code is not authority to silently redefine the design system. If the implementation is an approved newer reusable pattern, update `docs/DESIGN.md` in an authorized task. Otherwise, future authorized frontend work must align the implementation with the documented system. Resolve business, security, authorization, accessibility, and usability conflicts in favor of those higher-priority concerns.
- Applied migrations and the observed database describe physical implementation reality, but they do not override business intent. Never edit an applied migration; use a new migration and update `docs/database-schema.md` when a schema correction is authorized.
- Logs cannot override normative documentation. A successful test proves observed behavior, not that the behavior is the approved business rule or architecture.
- If two authoritative documents conflict and the precedence rules do not resolve the issue, stop before encoding an assumption. Record or request the missing decision in the appropriate place: `docs/state.md` for business decisions or an ADR for durable technical decisions.
- When an authorized code, schema, or configuration change makes documentation inaccurate, updating the affected documentation is part of that same task.

### Documentation update responsibilities

- The person or agent making a change owns updates to every documentation source made inaccurate by that change.
- Phase implementers update `docs/implementation-log.md` and `docs/testing-log.md` at every phase boundary. Material work and verification evidence must be recorded in the appropriate log, never in `docs/state.md`.
- Business behavior is added to or changed in `docs/state.md` only after confirmation. Unresolved business questions belong under its open-decisions section and must not be presented as implemented facts.
- Authors of architectural changes update `docs/architecture.md` and create or supersede an ADR when the decision is durable and cross-cutting.
- Authors of database changes update `docs/database-schema.md`, the migration documentation when needed, and provide rollback without rewriting an applied migration.
- Frontend authors own design-system compliance, responsive and accessibility verification, reuse of approved tokens/components, and reporting of deviations. They update `docs/DESIGN.md` only for an intentional, confirmed design-system or reusable-pattern change.
- The verifier records exact commands, results, failures, skips, and material environment qualifications in `docs/testing-log.md` without credentials or secret values.
- The final task report lists documentation files changed and identifies unresolved conflicts or decisions.

### Mandatory task-start checklist

Before making any repository change:

- [ ] Read the current task requirements and confirm the authorized scope and prohibited changes.
- [ ] Read `docs/AGENTS.md` completely, including this section.
- [ ] Classify the task and read the combined minimum set from the table above.
- [ ] Inspect relevant ADRs and check whether any governing decision has been superseded.
- [ ] Check `docs/state.md` for applicable confirmed rules and open business decisions; do not invent an answer for an open decision.
- [ ] Inspect the relevant implementation, tests, migrations, and current worktree state before editing.
- [ ] Identify the authoritative source for each requirement and resolve or report conflicts before encoding assumptions.
- [ ] Identify which documentation files the task will make inaccurate and include their updates in scope.
- [ ] Confirm that planned log updates contain evidence only and that no documentation change will expose credentials, connection strings, or other secrets.
- [ ] For any frontend, UI, interaction, or responsive task, read `docs/DESIGN.md` completely and identify the applicable rules.
- [ ] Inspect existing theme tokens, CSS variables, shared components, and established responsive patterns before creating styling.
- [ ] Identify applicable UI states, supported breakpoints, accessibility checks, and visual-verification methods.
- [ ] Identify and report any required design-system deviation before encoding a new reusable pattern.

### Frontend final-report requirements

For any frontend task, the final report must identify:

- the relevant `docs/DESIGN.md` sections followed;
- design tokens reused or intentionally introduced;
- shared components reused, extended, or created;
- responsive layouts and interaction states checked;
- accessibility checks performed;
- the visual-verification method; and
- approved or unresolved design-system deviations.

Screenshots are not mandatory when the execution environment has no browser. In that case, explicitly mark visual browser verification as skipped and explain why.
