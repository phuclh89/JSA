# JSAMS Design System — Wise-Inspired Visual Direction

This is the normative frontend design system for JSAMS. It draws inspiration from selected visual characteristics associated with Wise—near-black text, a lime accent, confident typography, rounded forms, and minimal ring-based elevation—but it is not an instruction to copy the Wise brand. JSAMS and approved PV Drilling identity, business requirements, safety, security, accessibility, and operational usability take precedence.

## 1. Product-specific interpretation

JSAMS is an enterprise safety-management application. Functional clarity, information density, status visibility, localization, and safe workflow operation take precedence over literal imitation of any inspiration source.

- Never copy or use Wise trademarks, logos, wordmarks, proprietary assets, layouts presented as trade dress, or unlicensed font files.
- Use only approved JSAMS or PV Drilling names, marks, and assets. Keep shell branding configurable where practical.
- Preserve the familiar Browse/Operations application-shell structure unless an authorized requirement changes it.
- Presentation-oriented surfaces may be expressive; administration, approval, form, grid, risk, and detail screens must prioritize scanability and dependable operation.
- A visual treatment must never obscure risk, approval state, ownership, permission denial, validation feedback, or another safety-critical fact.

## 2. Visual direction

The JSAMS visual direction uses a warm off-white canvas, near-black text, a controlled lime accent, dark green contrast, confident headings, rounded components, and minimal ring shadows.

### Core characteristics

- Near black (`#0e0f0c`) for primary text and selected dark surfaces.
- Lime accent (`#9fe870`) with dark green (`#163300`) text for primary positive calls to action.
- Inter as the practical default UI font.
- Rounded controls and containers, restrained according to information density.
- Minimal ring-based elevation rather than decorative drop shadows.
- Clear semantic state treatment that never relies on color alone.
- Subtle interaction feedback that respects dense layouts and reduced-motion preferences.

## 3. Design tokens

Approved values must be exposed through the centralized application theme, design tokens, or CSS variables. New frontend code must reuse those definitions instead of repeatedly hard-coding values such as `#9fe870`, `#0e0f0c`, `#163300`, standard ring shadows, radii, or spacing.

Do not rename existing implementation tokens merely to match the illustrative names below. When implementation work is authorized, consolidate repeated values through the repository's existing Ant Design theme or shared styling mechanism.

### Token categories

The centralized token system must cover:

- brand and accent colors;
- semantic success, warning, danger, and information colors;
- primary, secondary, muted, and inverse text;
- page, panel, elevated, selected, and disabled surfaces;
- standard, strong, focus, and accent borders;
- focus rings;
- spacing;
- radii;
- typography;
- motion duration, easing, and scale;
- supported responsive breakpoints where technically applicable.

### Color roles

| Role             | Value                     | Intended use                                         |
| ---------------- | ------------------------- | ---------------------------------------------------- |
| Near black       | `#0e0f0c`                 | Primary text and selected dark shell surfaces        |
| Lime accent      | `#9fe870`                 | Primary CTA and restrained brand accent              |
| Dark green       | `#163300`                 | Text on lime, links, and deep green emphasis         |
| Light mint       | `#e2f6d5`                 | Selected navigation, soft positive or accent surface |
| Pastel green     | `#cdffad`                 | Controlled interactive contrast hover                |
| Warm dark        | `#454745`                 | Secondary text and strong neutral details            |
| Gray             | `#868685`                 | Muted text when contrast remains sufficient          |
| Light surface    | `#e8ebe6`                 | Subtle green-tinted surface                          |
| Page surface     | `#f5f7f3`                 | Warm off-white application background                |
| Positive green   | `#054d28`                 | Success state                                        |
| Danger red       | `#d03238`                 | Error and destructive state                          |
| Warning yellow   | `#ffd11a`                 | Warning state with suitable text/icon contrast       |
| Information tint | `rgba(56, 200, 255, 0.1)` | Supporting information surface                       |
| Bright orange    | `#ffc091`                 | Restrained warm semantic accent                      |

Lime is not a generic status color and must not cover large operational surfaces. Destructive actions use semantic danger styling, not lime. Risk, approval, warning, and error states require text, iconography, or another non-color indicator.

## 4. Typography

### Licensed font policy

- Display: an approved repository display font, with `Inter`, `Helvetica`, `Arial`, sans-serif as safe fallbacks.
- Body/UI: `Inter`, `Helvetica`, `Arial`, sans-serif.
- Wise Sans is proprietary. Do not download, bundle, commit, redistribute, fabricate, or expose Wise Sans or any other unlicensed font in an AI response or task output.
- Wise Sans may be referenced by implementation only if the repository already contains an approved, legally licensed integration. Its absence is never a reason to block normal JSAMS UI work.
- Contextual alternates such as `"calt"` may be enabled only where the selected licensed font supports them without harming legibility.

### Operational type scale

Use responsive or bounded sizing where appropriate. These values define the practical enterprise baseline:

| Role            | Size                            | Weight  | Line height | Guidance                           |
| --------------- | ------------------------------- | ------- | ----------- | ---------------------------------- |
| Page title      | `clamp(1.75rem, 2.5vw, 2.5rem)` | 700–900 | 1.05–1.2    | One clear page-level heading       |
| Section heading | `1.5rem`                        | 700     | 1.2         | Form, dashboard, or detail section |
| Card title      | `1.25rem`                       | 600–700 | 1.25        | Compact and scannable              |
| Body            | `1rem`                          | 400     | 1.5         | Default reading text               |
| Label           | `0.875rem`                      | 600     | 1.4         | Form and metadata labels           |
| Caption         | `0.75rem–0.875rem`              | 400–600 | 1.4–1.5     | Supporting information only        |
| Table text      | `0.875rem`                      | 400–600 | 1.35–1.5    | Preserve dense-row readability     |
| Button text     | `0.875rem–1rem`                 | 600     | 1.2–1.4     | Clear action wording               |

Bold 96–126px billboard typography and a 0.85 line height are optional inspiration only for exceptional marketing, authentication, landing, or major empty-state surfaces when space and content permit. They are not appropriate defaults for JSAMS administration or operational screens.

- Do not use ultra-tight line height where it clips diacritics, overlaps text, breaks localization, or reduces readability.
- Vietnamese and English labels must both render safely.
- Body text does not need weight 600 when regular weight creates better hierarchy and readability.
- Dense screens must distinguish page titles, section labels, field labels, values, and supporting text without excessive size.

## 5. Spacing, shape, and elevation

### Spacing

Use an 8px base rhythm. Approved increments include `4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px`, and `40px`; smaller optical adjustments may be tokenized when a shared component requires them.

### Radius

| Role     | Radius     | Use                                                            |
| -------- | ---------- | -------------------------------------------------------------- |
| Minimal  | `2px–4px`  | Focus details or compact inline elements                       |
| Input    | `8px–10px` | Fields, comboboxes, compact operational controls               |
| Standard | `16px`     | Buttons, small cards, selected navigation                      |
| Medium   | `20px`     | Medium panels and mobile content surfaces                      |
| Large    | `30px`     | Presentation-oriented feature cards                            |
| Section  | `40px`     | Spacious presentation surfaces only                            |
| Pill     | `9999px`   | Primary buttons, tags, or compact pill patterns where suitable |
| Circle   | `50%`      | Avatars and icon badges                                        |

Operational controls may use smaller radii than presentation cards when density requires it. Do not force 30–40px cards into dense forms, tables, dashboards, or administration pages, and do not use pill shapes where they obscure control grouping or state.

### Elevation

Prefer flat surfaces and ring shadows:

- Standard ring: `rgba(14, 15, 12, 0.12) 0 0 0 1px`.
- Focus treatment: a clearly visible high-contrast outline or inset/outer ring that is not conveyed by color alone.
- Avoid decorative, heavy drop shadows. Modals and drawers may use the minimum elevation necessary to separate layers.

## 6. Interaction and motion

### Buttons

- Primary positive CTA: lime background, dark-green text, clear focus-visible treatment.
- Secondary action: neutral or subtle dark-green-tinted surface.
- Destructive action: danger color, explicit wording, and confirmation when consequences justify it.
- Workflow-critical actions must make the action and resulting state clear; visual playfulness is secondary.
- Disabled actions must not animate and should explain why through nearby text or an accessible tooltip when the reason is not obvious.

A `scale(1.05)` hover and `scale(0.95)` active treatment may be used for spacious primary controls when it does not move surrounding layout. It is not mandatory for every interactive element.

- Dense toolbar, table, grid, icon, and inline controls should use a smaller tokenized scale or a non-scaling background/border treatment.
- Transforms must not cause collisions, clipping, layout movement, or obscured content. Consider transform origin and stacking context.
- Respect `prefers-reduced-motion: reduce`; remove non-essential transforms and transitions.
- Focus-visible feedback must remain present independently of hover animation.

## 7. Required component behavior

### Application shell

- Preserve JSAMS or approved PV Drilling branding; never use a Wise logo or wordmark.
- Maintain Browse/Operations areas, desktop sidebar, mobile drawer, action ribbon/toolbars, central content, and session information where applicable.
- Navigation state, current area, environment indication, and user context must remain distinguishable.
- Permission-aware visibility improves navigation but never replaces backend enforcement.

### Navigation, tabs, and drawers

- Selected, hover, focus-visible, disabled, and permission-denied behavior must be unambiguous.
- Collapse desktop navigation at supported responsive widths without losing access to allowed destinations.
- Mobile drawers must trap and restore focus correctly, close predictably, and expose an accessible name.
- Long and translated labels must wrap or truncate with an accessible full-name mechanism.

### Action ribbons and toolbars

- Group actions by workflow purpose and priority.
- Allow wrapping or controlled overflow instead of clipping on smaller screens.
- Keep destructive actions visually separate from primary positive actions.
- Explain actions disabled by lifecycle state, permission, scope, validation, or missing prerequisites.

### Forms

- Associate labels, descriptions, validation errors, and required indicators with their controls.
- Use stacked forms on narrow screens and preserve a logical keyboard/tab order.
- Long labels, help text, multi-select values, and localized validation messages must wrap safely.
- Read-only and disabled are distinct states: read-only content remains readable and selectable; disabled controls communicate non-availability.

### Data tables and grids

- Prioritize scanability, stable alignment, readable density, and clear row/action association.
- On smaller screens, provide safe horizontal scrolling, priority columns, responsive details, or another approved pattern; never silently discard safety-critical columns.
- Headers, sorting, filtering, selection, loading, empty, error, and pagination states require accessible semantics and visible feedback.
- Sticky regions must not cover focused controls or content at text zoom.

### Status badges and safety information

- Status, approval, lifecycle, risk, warning, and error meaning must use text and, where helpful, icons in addition to color.
- Maintain readable contrast for both badge text and surrounding content.
- Do not reuse the same visual treatment for materially different business states.

### Dialogs and destructive actions

- Modal titles state the decision; primary and cancel actions remain easy to distinguish.
- Size modals responsively and allow content to scroll without hiding actions.
- Destructive or irreversible actions use semantic danger styling and an appropriate confirmation pattern.
- Return, Reject, Cancel, Retire, or similar business actions must preserve required explanations and comments defined by business rules.

### Feedback and exceptional states

Every applicable screen or component must address default, hover, active, focus-visible, disabled, loading, empty, validation error, system error, read-only, permission denied, and document-state-unavailable states.

- Loading feedback must not imply success and should preserve useful layout stability.
- Empty states explain what is absent and offer only allowed next actions.
- Validation messages identify the affected field and recovery action.
- System errors provide a safe explanation and recovery path without exposing internals.
- Access Denied explains lack of access and provides a route back without revealing permission-resolution details.

## 8. Accessibility

- Meet the WCAG contrast level adopted by the project; at minimum, target WCAG 2.1 AA for normal text, controls, and meaningful graphics.
- All functionality must be keyboard operable with logical focus order and visible `:focus-visible` treatment.
- Use semantic HTML before ARIA. Icon-only controls require accessible names.
- Associate field errors and help text programmatically with inputs.
- Do not communicate risk, approval, workflow state, validation, or availability by color alone.
- Support browser text zoom without clipping, lost actions, or overlapping safety-critical information.
- Respect reduced-motion preferences and avoid flashing or unnecessary continuous animation.
- Test Vietnamese and English text, long labels, wrapping, overflow, and localization expansion.
- Preserve safety-critical information at every supported viewport and interaction state.
- Touch targets should normally be at least 44 by 44 CSS pixels unless a compact desktop-only operational pattern has an accessible equivalent.

## 9. Responsive behavior

Use the established breakpoint model unless an intentional design-system change is confirmed:

| Layout  | Width          | Expected behavior                                                            |
| ------- | -------------- | ---------------------------------------------------------------------------- |
| Mobile  | `<768px`       | Single-column flow, drawer navigation, stacked forms, wrapped toolbars       |
| Tablet  | `768px–991px`  | Adaptive one/two-column flow, controlled navigation collapse                 |
| Desktop | `992px–1440px` | Full operational shell and standard content density                          |
| Large   | `>1440px`      | Expanded space without unbounded line lengths or excessively stretched forms |

- Navigation collapses without removing allowed actions or current-location context.
- Tables and dense risk-assessment content scroll or adapt safely; critical data must remain reachable.
- Forms stack when columns no longer preserve readable labels and inputs.
- Toolbars wrap or use an accessible overflow menu.
- Modals fit within the viewport; long content scrolls internally while essential actions remain available.
- Drawers are preferred for mobile navigation and may support focused contextual work when approved.
- Multi-select controls and long text must not force viewport overflow.
- Do not introduce a different breakpoint system silently.

The `768px` navigation boundary reflects the established application-shell implementation. Future breakpoint changes require an intentional design-system update rather than a one-screen media-query exception.

## 10. Design compliance and deviations

For each frontend task:

1. Read this document completely and identify applicable rules.
2. Inspect existing theme tokens, shared components, and responsive patterns.
3. Reuse or extend the closest approved token and component.
4. Verify applicable interaction states, breakpoints, accessibility behavior, and visual output.
5. Add a genuinely reusable new pattern to this document only when the design-system change is intentional and confirmed; a one-off screen detail does not automatically become a design-system rule.

Do not silently deviate. If business behavior, security, authorization, accessibility, usability, an explicit requirement, or a genuine technical limitation conflicts with a design rule, apply the smallest necessary deviation, document the reason, and report it. If resolving the conflict would redefine the design system without authorization, request confirmation before creating a new pattern.

## 11. Quick reference

- Primary text: near black (`#0e0f0c`).
- Application background: warm off-white (`#f5f7f3`) or white panel surfaces.
- Primary positive CTA: lime (`#9fe870`) with dark-green (`#163300`) text.
- Default practical font: `Inter`, `Helvetica`, `Arial`, sans-serif.
- Standard small-card radius: `16px`; spacious feature-card radius: up to `30px`.
- Standard elevation: minimal one-pixel ring.
- Motion: subtle, collision-free, disabled under reduced-motion preferences.
- Brand: JSAMS or approved PV Drilling identity only.
