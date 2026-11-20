# Calacot Admin — Design System V1

**Phase 1: audit and design foundations.** Prepared 19 November 2026. This document changes no production behaviour. Every phase from Phase 2 on waits until this document has been reviewed.

**Evidence standard.** Findings come from reading the repository's working tree, including uncommitted changes on `main` as of this date. Nothing here comes from a rendered, authenticated browser session. "Confirmed" means confirmed in source. "Suspected" means it needs runtime verification. File paths are evidence, not guesses.

**References reviewed.** Six screenshots were supplied and reviewed. Each has an identifier:

| ID | Content |
|---|---|
| R1 | "Order Queue": purple-accent order table with Quick Stats KPI row, status filter chips, avatar rows, pill status badges, numbered pagination, "Auto-refreshing every 2s" indicator |
| R2 | Logistics "Application #3-218-3" workspace: price card with margin deltas, route timeline, carrier comments with overflow menu, checkbox status filter with counts, settings toggles, file attachment card (blue accent) |
| R3 | "Commerce Command Center": KPI tiles with deltas, intraday line chart with tooltip, Monthly Goals progress bars, Live Activity feed, 7-day bar chart with highlighted bar, Recent Orders table, Sales by Region |
| R4 | Chart kit: multicolour gradient line, bar, donut, sankey, sparkline and KPI cards on soft-shadow white cards |
| R5 | Button size matrix: small, regular and large buttons, icon-leading, icon-trailing and icon-only, light and dark fills, on a dark canvas |
| R6 | Purple button set on dark: filled, tinted, outline, icon-only and chip buttons |

**Missing references.** There are no references for forms or data entry, dialogs or sheets, mobile or tablet layouts, empty or error states, navigation or sidebars, or date pickers. The rules for those areas below are derived from the codebase and the brief, not from a reference.

---

## A. Design system audit

### A1. Brand token inventory (authoritative values)

Source: `app/globals.css` and `app/layout.tsx`.

| Token | Value | Notes |
|---|---|---|
| `--color-brand-primary` | `oklch(0.8598 0.1719 88.44)` (gold) | Mapped to `--primary` in light and dark |
| `--color-brand-black` | `oklch(0.1941 0.012 285.23)` | `--primary-foreground` (light) |
| `--color-brand-white` | `oklch(0.9741 0.008 278.64)` | Root `<body>` background in light |
| `--color-brand-green` | `oklch(0.8803 0.2765 138.82)` | Not used in the admin |
| `--color-brand-accent` | `oklch(0.4778 0.1433 40.83)` (rust) | Only used by the `.care-wallpaper` style |
| Sans font | Plus Jakarta Sans → `--font-sans` | Applied to `<html>` via `font-sans` |
| Heading font | Outfit → `--font-heading` | Applied to bare `h1`–`h6` |
| `--radius` | `0.625rem` (10px) | Scale `sm`–`4xl` derived from it |
| Neutrals | shadcn "neutral" defaults (`oklch(… 0 0)`) | Neutral grey, with no tint toward the brand-black hue |
| `--chart-1…5` | Five greys (`0.87`→`0.269` lightness) | No brand or semantic colours |
| Dark `--sidebar-primary` | `oklch(0.488 0.243 264.376)` (blue) | **Off-brand**: this is shadcn's default blue, not a Calacot colour |
| Default theme | `defaultTheme="dark"` (`app/layout.tsx`) | The admin opens in dark mode by default |

The design system keeps these values unchanged. V1 adds *derived* tokens only: semantic colours, surface steps and chart roles. Every derived token is defined with `color-mix()` or neutral steps, not as a new brand hue.

### A2. Confirmed inconsistencies and defects

**Foundations**

1. **The heading font resolves two ways (suspected, verify computed style).** `@theme inline { --font-heading: var(--font-sans) }` makes the `font-heading` utility, which `CardTitle` uses, resolve to Plus Jakarta Sans. Bare `h1`–`h6` use the next/font variable `--font-heading`, which is Outfit. Card titles and page headings can therefore render in different families. This is a fix to wiring only: the font families themselves do not change.
2. **There are two `cn` implementations.** Ten primitives import `cn` from the npm package `cn` (`badge`, `table`, `sidebar`, `tabs`, `chart`, `avatar`, `drawer`, …). The rest import `@/lib/utils`. Class merging could behave differently between the two.
3. **There are two toast systems.** `components/ui/toast.tsx` (Base UI) is mounted in the root layout. `components/ui/sonner.tsx` is only used by the dead `components/data-table.tsx`. No admin mutation raises a toast today.
4. **There are no semantic colour tokens.** No tokens exist for success, warning or info. Pages hardcode `amber-*` (11 occurrences, e.g. `design-purchases/[purchaseId]`, the expenses "Needs attention" panel, `receivables-panel.tsx`) and `orange-200`.
5. **Chart tokens are greyscale placeholders**, and the dark sidebar primary is shadcn blue (see A1).
6. **Arbitrary values are used:** `text-[11px]`, `text-[13px]`, `text-[15px]`, `text-[10.5px]`, `w-[340/360/400/900px]`, `h-[57px]`, `h-[85vh]`, mainly in `customer-care/page.tsx` and `quote-form.tsx`.

**Components**

7. **Control heights are inconsistent.** `Button` defaults to 44px (`h-11`), with `sm` at 36px. `Input` and `Select` are 44px. Native `<select>` elements in `list-controls.tsx` and `financial-reports/page.tsx` are 36px (`h-9`, `rounded-md`), so a single filter row mixes 44px and 36px controls.
8. **Native `<select>` is used in 19 files** (`leads`, `tasks`, `reports`, `financial-reports`, `staff-forms`, `settings-form`, `lead-conversion`, `catalogue-forms`, `document-forms`, `account-forms`, …) alongside the Base UI `Select`. The two have different focus rings, radii and heights.
9. **Badge has no status semantics.** Variants are `default`, `secondary`, `destructive`, `outline`, `ghost` and `link`. Statuses are rendered as `secondary` (`columns.tsx`), or as `default` (gold) for "Confirmed" on the payments page, so gold is being used to mean success. Labels are raw enum strings such as `provider_accepted`, which becomes "provider accepted".
10. **The button shape conflicts with the brand guide.** `docs/design-system.md` defines pill buttons (`rounded-full`) sized for marketing pages (44/48px). Dense admin toolbars inherit those 44px pills, which is heavier than the references and the data density require.
11. **Card has no elevation tokens.** It uses `ring-1 ring-foreground/10` with no shadow scale. Where pages need emphasis, they nest bordered boxes (`rounded-lg border p-3`) inside cards.

**Tables**

12. **There are two parallel table systems.**
    - `components/sales/data-table.tsx` (TanStack v9: client toolbar, sort, column visibility, URL-driven server pagination) serves clients, projects, quotations, invoices and deliveries.
    - `components/admin/list-controls.tsx` (`FilterBar` + `Pager` + hand-written `<Table>`, a GET form with an Apply button) serves leads, payments, expenses, catalogue, documents and staff.
    - The financial reports page uses its own `GroupTable`. The 883-line `components/data-table.tsx` has **no importers** and is dead code.
13. **Gaps in `sales/data-table.tsx`:**
    - Column visibility is not persisted, the menu lists raw column ids (`created`, `actions`) instead of their labels, and there is no "Reset columns".
    - Sort indicators are text arrows inside ghost buttons.
    - The error state is a bare `<p role="alert">` with no retry.
    - The table header renders even when the table is empty.
    - There is no loading skeleton (only `aria-busy`), and no mobile card representation (only horizontal scroll).
    - Primary actions ("New quotation", `ClientForm`, `ProjectSheet`) and "Export matching records (up to 1,000)" sit in the filter toolbar instead of a page header.
14. **Formatting is inconsistent:**
    - Money appears as `${currency} ${value}` with no grouping in `columns.tsx` and the dashboard, `toLocaleString("en-US")` in `list-controls.tsx`, `formatAmount` (finance) with USD decimals, and a third `formatAmount` in `lib/utils.ts` plus a fourth in `lib/design-purchases/model.ts`.
    - Dates appear as `slice(0,10)` ISO strings in lists and `Intl.DateTimeFormat("en-UG", …Africa/Kampala)` on detail pages.

**Shell and navigation**

15. **Sidebar items never receive `isActive`** (`nav-main.tsx`, `nav-documents.tsx`), so there is no active-navigation state anywhere.
16. **The header `<h1>` is hardcoded** to "Calacot Group Uganda Limited" (`site-header.tsx`). List pages have no page-level `<h1>`: the page title is a `CardTitle` `<div>`. Detail pages use `CardTitle` too. The header also nests `px-4 lg:px-6` padding twice, and there are no breadcrumbs.
17. **`<main>` elements are nested.** `SidebarInset` renders `<main>`, and every page renders its own `<main>`.
18. **Page geometry is inconsistent.**
    - Most pages use `flex flex-col gap-6 p-4 md:p-6`, but financial reports uses `gap-4`.
    - `design-purchases` uses a marketing layout (`max-w-7xl pt-28 pb-24`, `text-4xl sm:text-5xl`, "Design purchases.") inside the admin shell.
    - `customer-care` defines its own brand-black header band, its own input styles and font sizes.

**Feedback and states**

19. **Loading and error states:**
    - `loading.tsx` files render a title and a sentence ("Loading…"), not skeletons. `Skeleton` is used only inside `sidebar.tsx`.
    - Twelve `error.tsx` files exist and have consistent copy, but most list routes (clients, quotations, invoices, payments, leads) have none.
20. **Success feedback** is mixed. Some forms announce results (`useActionState` in `lead-update-form.tsx`, `aria-live` in `quote-form.tsx`). Others rely on the page re-rendering after a redirect.

### A3. UX deficiencies against the brief

- **Action orientation is uneven.** Good patterns already exist and should become the standard: the dashboard "Needs attention" list (counts linking to filtered lists), the expenses "Needs attention" panel and `ReceivablesPanel`. List pages such as quotations, however, open with a generic "Search, filter and review organization records." card and nothing surfaces drafts, items awaiting a decision or expiring quotations.
- **The quotation detail page has no page-level primary action.** The PDF link is a bare `<Link>`, status is shown as a secondary badge inside the description, and the total is unformatted.
- **Financial reports are text and tables only.** Questions such as "is money coming in faster than it is going out?" have no visual answer. See G, the chart section.
- **The admin has no charts in use.** `components/ui/chart.tsx` (the shadcn Recharts wrapper) exists, and `recharts@3.8` is installed.

### A4. Strengths to keep

- **Accessible primitives:** Base UI underneath, focus rings on `Button`, `Input` and `Select`, and `motion-reduce` support on `Button`.
- **Server-driven URL query state for lists:** it is shareable, survives a back navigation and fits server-side pagination.
- **Data-integrity copy:** financial reports already state currencies separately, describe Kampala dates and explain what figures are not (no general ledger). This honesty is a design asset and must be kept.
- **Permission-aware rendering:** dashboard metrics distinguish `ready`, `restricted` and `error`. This becomes the model for every widget.

---

## B. Screenshot reference analysis

| Pattern | Source | Decision | Rationale and adaptation |
|---|---|---|---|
| Page header: small title, one filled primary action, outline secondary actions (Export, Sync) | R1, R3 | **Adopt** | Matches "one dominant primary action". The primary uses gold; secondaries are outline or ghost. |
| Quick Stats KPI row (icon, label, large tabular figure, delta chip, comparison note) | R1, R3 | **Adapt** | Use only where a KPI drives a decision, and link each KPI to its filtered list. Show deltas only when a correct comparison period exists (see G7). UGX and USD are shown as separate figures, never summed. |
| Status filter chips with an "All" pill above the table | R1 | **Adopt** | Replaces the status `<select>` on list pages. Chips show counts when the server provides them (R2's checkbox list with counts confirms the pattern). |
| Search field inline in the table toolbar, left of the filters | R1 | **Adopt** | Replaces the labelled 44px search block. The label becomes visually hidden but stays accessible. |
| Pill status badges with tinted background and dark text | R1, R3 | **Adapt** | Use semantic tokens with a leading dot or icon, so status is not shown by colour alone. Reject R1's purple "Processing" and grey "On Hold" palette in favour of Calacot semantic roles. |
| A single "⋯" overflow menu per row as the action column | R1, R3, R2 | **Adopt** | The primary row action is clicking the row or its identifier. Secondary actions live in the overflow menu. |
| Avatar plus two-line identity cell (name, email) | R1, R3 | **Adapt** | Use for clients and staff. Initials avatars only, with no stock photography. |
| Numbered pagination with "Showing 1–10 of 80" | R1 | **Adopt** | Replaces "Page X of Y" plus Previous and Next. |
| "Auto-refreshing every 2s" freshness indicator | R1 | **Adapt** | Show "Updated hh:mm" where data is cached or polled (deliveries, customer care). Never claim live data that isn't live. |
| Sectioned card ("Quick Stats", "All Orders") on a slightly darker canvas | R1, R3 | **Adopt** | This is the basis of the 60/30 surface model (C1). |
| Detail workspace: left context column, centre primary work, right status or settings | R2 | **Adapt** | Use for project and quotation detail pages on screens ≥1280px. It stacks on smaller screens. |
| Price card with two figures and percentage-delta chips | R2 | **Adapt** | Use for quotation and project financial summaries. Show a delta only when the definition is documented. |
| Vertical timeline with step markers and timestamps | R2 | **Adopt** | Use for quotation versions, delivery attempts, project milestones and activity. `components/sales/activity.tsx` is the first candidate. |
| Comment thread with an edit and delete overflow menu | R2 | **Adapt** | Use for project task comments. Delete is styled as destructive and requires confirmation. |
| Inline settings toggles with an Apply and Reset footer | R2 | **Adopt** for preference panels, such as column visibility and notification settings. |
| Attachment card with filename, status and actions | R2 | **Adopt** | Use for documents and expense receipts. |
| Line chart with a hover crosshair and a floating value tooltip | R3 | **Adopt** | This is the standard time-series interaction (G5). |
| Bar chart with the selected or current bar highlighted and the rest muted | R3 | **Adopt** | Emphasis through a single accent is exactly the 10% rule. |
| Progress bars against goals ("Monthly Goals") | R3 | **Adapt** | Use only where a real target exists, such as an expense budget or quotation validity. No invented targets. |
| Live activity feed with coloured dots and relative times | R3 | **Adapt** | Use for audit and activity feeds. Every dot carries a text label. |
| Region list with flags | R3 | **Reject** | Calacot does not operate by geography; divisions replace regions. |
| Multicolour gradient lines, rainbow bar lists, sankey, rainbow donut | R4 | **Reject** visual treatment; **adopt** the card anatomy | Breaks the 60/30/10 rule and the colour-meaning consistency rule. Sankey is out of scope for V1. The card anatomy (title, description, "⋯", visualisation, legend) is adopted. |
| Soft diffuse shadows on white cards on a grey canvas | R4, R3 | **Adapt** | Becomes elevation level 1. It is restrained, with no stacked borders and shadows. |
| Three-tier button sizes; icon-leading, icon-trailing and icon-only variants; light and dark fills | R5 | **Adopt** structure | Sizes are re-tuned for admin density (C5). Icon-only buttons are square and get an accessible label. |
| Filled, tinted ("soft") and outline accent buttons | R6 | **Adapt** | A "soft" tinted variant fills the gap between `secondary` and `default`. Purple is **rejected**; gold is used. |
| Purple, blue and violet accent palettes | R1, R2, R3, R6 | **Reject** | The brand palette is non-negotiable. |

---

## C. Proposed Calacot Design System V1

### C1. Colour (60/30/10)

**The role model.** Brand values are unchanged. Neutrals gain a faint brand-black tint and a defined step scale.

| Role | Share | Light | Dark |
|---|---|---|---|
| Canvas (`--background` in the admin shell) | 60% | `--color-brand-white` | `--color-brand-black` |
| Surface (`--card`, tables, sidebar) | 30% | `oklch(1 0 0)` | `color-mix(in oklch, brand-black, white 5%)` |
| Surface-subtle (table header, footer, input fill) | | `color-mix(brand-white, brand-black 3%)` | `color-mix(brand-black, white 8%)` |
| Accent (primary action, selected state, focus, chart emphasis) | 10% | `--primary` (gold) | `--primary` (gold) |

**Rules**

- **One gold filled button per view region:** the page header, or a dialog footer.
- **Gold is never text on a light surface.** At lightness 0.86 it fails WCAG contrast; gold text is used only on dark surfaces. Selected states on light surfaces use a gold *indicator* (a bar, dot or ring) plus dark text.
- **The dark-mode sidebar primary becomes gold.** It is currently shadcn blue, which is off-brand. The value changes; the brand does not.
- **The Calacot rust accent (`--color-brand-accent`) stays reserved** for rare, deliberate emphasis (e.g. the customer-care wallpaper). It is not used for status.

**Semantic tokens (new, derived).** Each role has `-foreground`, `-soft` (a tinted background at roughly 12%) and `-border` (roughly 30%).

| Token | Purpose | Derivation |
|---|---|---|
| `--success` | Paid, confirmed, delivered, completed | Green hue ≈145, accessible lightness. Distinct from `brand-green`, which is too light for text. |
| `--warning` | Due soon, awaiting review, uncertain | Amber hue ≈75. Kept visibly distinct from brand gold by lowering lightness and raising chroma for text. |
| `--destructive` | Exists. Overdue, failed, rejected, void | Keep |
| `--info` | Informational, processing, queued | Neutral-blue hue ≈250, used sparingly |
| `--neutral` | Draft, archived, skipped | `--muted` and `--muted-foreground` |

Hardcoded `amber-*` and `orange-*` classes migrate to these tokens.

### C2. Typography

**Families stay unchanged.** Outfit is used for display, page titles and KPI figures. Plus Jakarta Sans is used for everything else. The `--font-heading` wiring (A2.1) is fixed so `font-heading` resolves to Outfit.

| Token (`@utility`) | Size / line height | Weight | Family | Use |
|---|---|---|---|---|
| `text-page-title` | 24/32 (20/28 below 640px) | 600, tracking −0.02em | Outfit | One `<h1>` per page |
| `text-section-title` | 18/28 | 600 | Outfit | Section `<h2>` |
| `text-card-title` | 15/22 | 600 | Plus Jakarta | Card and chart titles |
| `text-body` | 14/20 | 400 | Plus Jakarta | Default admin text |
| `text-body-strong` | 14/20 | 500 | Plus Jakarta | Identity cells, emphasis |
| `text-description` | 13/20 | 400, muted | Plus Jakarta | Card and page descriptions (one sentence) |
| `text-label` | 13/18 | 500 | Plus Jakarta | Form labels |
| `text-table-head` | 12/16 | 500, muted, no uppercase | Plus Jakarta | Table headers |
| `text-caption` | 12/16 | 400, muted | Plus Jakarta | Helper text, timestamps, chart axes |
| `text-metric` | 28/34 (24/30 below 640px) | 600, `tabular-nums` | Outfit | KPI figures |
| `text-metric-sm` | 18/24 | 600, `tabular-nums` | Outfit | Secondary figures |

**Rules**

- **Numbers.** Every number in a table, KPI or chart uses `tabular-nums` and is right-aligned in tables. Currency is formatted by a single shared `formatMoney(currency, value)`.
- **Inputs on mobile.** Inputs keep 16px text on mobile to prevent iOS zoom (already `text-base md:text-sm`).
- **No arbitrary sizes.** `text-[11px]` and similar values are replaced by the tokens above.
- **Marketing utilities stay out of the admin.** `.title`, `.text-h3`… and `section-heading` remain on marketing pages and are not used in the admin.

### C3. Spacing and layout (4px base, Tailwind `--spacing`)

| Token | Value | Use |
|---|---|---|
| Page gutter | 16px (<640) · 24px (≥768) · 32px (≥1440) | `<PageContainer>` horizontal padding |
| Page max width | none for tables; 1200px for forms and detail reading | |
| Page vertical rhythm | header→content 24px; between sections 24px; inside a section 16px | Replaces the mixed `gap-4` and `gap-6` |
| Card padding | 20px (16px compact, below 640px) | |
| Card header→body | 16px | |
| Form field stack | 16px between fields, 6px label→control, 4px control→helper | |
| Form section gap | 32px with a section title | |
| Toolbar gap | 8px between controls, 12px between groups | |
| Dialog padding | 24px; sheet padding 24px; footer gap 8px | |
| Icon-to-label | 8px (6px in `sm` controls) | |
| Sidebar | 256px expanded (currently 288px via `--spacing*72`), 56px icon rail, item height 36px, group gap 16px | |
| Header | 56px (currently 48px) | Contains the trigger, breadcrumbs and global actions |

### C4. Radius and elevation

| Radius token | Value | Use |
|---|---|---|
| `--radius-control` | 8px | Inputs, selects, small buttons, chips, table toolbar |
| `--radius-button` | 8px admin / `full` marketing | Admin buttons become rounded rectangles (R5); marketing pills stay as defined in `docs/design-system.md` |
| `--radius-card` | 12px | Cards, chart cards, dialogs, sheets (inner edge) |
| `--radius-badge` | full | Status pills |

The admin radius is scoped with a `data-surface="admin"` attribute on the shell, so public pages keep their pills.

| Elevation | Token | Light | Use |
|---|---|---|---|
| 0 | `--shadow-0` | none; surface contrast only | Table rows, nested panels |
| 1 | `--shadow-1` | `0 1px 2px oklch(0.19 0.01 285 / 4%), 0 1px 1px oklch(… / 3%)` plus a 1px `--border` | Default card |
| 2 | `--shadow-2` | `0 4px 12px oklch(… / 6%), 0 1px 3px oklch(… / 4%)` | Attention panel, hovered interactive card, primary button hover |
| 3 | `--shadow-3` | `0 12px 32px oklch(… / 12%), 0 2px 6px oklch(… / 6%)` | Popover, dropdown, dialog, sheet, toast |

**Rules**

- **Dark mode.** Shadows drop to roughly 40% strength, and surfaces separate by lightness steps.
- **Never stack** a ring, a border and a shadow on the same element.
- **Replace the card ring.** `Card`'s `ring-1 ring-foreground/10` is replaced by elevation 1.

**Current card geometry (supersedes the card rows above).** Admin cards are now soft, large-radius surfaces:

| Token / utility | Value | Use |
|---|---|---|
| `--card-radius` | 1.75rem (28px) | `Card`, `surface-card` (tables, hand-built sections, skeletons) |
| `--card-radius-sm` | 1.25rem (20px) | `Card size="sm"`, `variant="flat"` |
| `--card-radius-inner` | 1rem (16px) | Panels, rows, notes and alerts nested inside a card, so corners stay concentric |
| `--elevation-card` / `shadow-card` | hairline highlight + wide diffused shadow | Every floating card |
| `--elevation-card-hover` / `shadow-card-hover` | stronger diffusion | Interactive cards on hover |
| `border-card-edge`, `bg-card-nested` | white edge / pure white (light) | Card edge; nested panel fill |

Use `surface-card` for any hand-built card container, and `rounded-(--card-radius-inner) border border-card-edge bg-card-nested` for nested panels. Notes keep their tone (`border-warning-border bg-warning-soft`) with the inner radius. Inputs and selects keep `rounded-md`: they are controls, not cards. `npm run test:design-system` fails on raw `rounded-xl border bg-card` or `rounded-lg border p-*` containers in admin code.

### C5. Components

**Buttons (admin scope)**

| Size | Height | Use |
|---|---|---|
| `sm` | 32px | Table toolbars, row actions, chips |
| `md` (admin default) | 36px | Page header and forms on desktop |
| `lg` | 44px | Mobile primary actions and touch-first contexts |

Icon-only sizes are 32, 36 and 44px squares.

| Variant | Use |
|---|---|
| `primary` | Gold, one per region |
| `secondary` | Neutral fill |
| `outline` | |
| `ghost` | |
| `soft` | New: gold tint at 14% with dark text, for "selected chip" and toggles |
| `destructive` | Solid; used only in a confirmation footer |
| `destructive-ghost` | Inside menus |
| `link` | |

- **States.** `loading` shows a spinner, keeps the button width and sets `aria-busy`. `disabled` sets the `disabled` attribute plus a tooltip with the reason, where the reason is known.
- **Touch targets.** On a coarse pointer every interactive element is at least 44×44px, via padding or a pseudo-element hit area.

**Inputs, selects, textareas and comboboxes**

- **Height.** 36px on desktop, 44px on coarse pointers (`@media (pointer: coarse)`).
- **Radius** is 8px, with one shared focus ring: a 2px `--ring` that is gold-based in the admin.
- **Selects.** Native `<select>` is replaced by `Select`, or by `NativeSelect`: a styled wrapper with identical tokens, for server GET forms that need progressive enhancement.
- **Currency inputs** carry a currency prefix adornment (via `input-group.tsx`), `inputMode="decimal"` and right alignment.

**Badges and status.** The new `<StatusBadge status="…" domain="quotation|invoice|payment|delivery|project|expense|lead" />`:

- Maps every enum to `{ label, tone: success|warning|destructive|info|neutral, icon }` through a single `lib/ui/status.ts` registry.
- Renders the tone's `-soft` background, the tone's foreground, and a 6px dot or icon.
- Always shows a human label. "accepted" becomes "Confirmed", which is already the business wording.

**Cards**

- **`Card` keeps its API.** It gains `variant="default|attention|flat|interactive"`:
  - `attention`: elevation 2 with a 3px warning or destructive inline-start bar.
  - `flat`: no shadow, for nested panels.
  - `interactive`: elevation-2 hover state, used when the whole card is a link.
- **New `MetricCard`:** label, value (`text-metric`), optional delta chip, optional comparison note and href. It handles `ready`, `restricted`, `error` and `loading`, mirroring `MetricResult` in `lib/admin/dashboard`.

**Dialogs and sheets**

| Pattern | Use | Width |
|---|---|---|
| `Dialog` | Confirmations and forms of 3 fields or fewer | ≤480px |
| `Sheet` (right) | Contextual forms of 4–12 fields (create project, record payment, column settings) | 480–560px |
| Dedicated page | Multi-step or long work (quotation builder, expense request) | |

- **Below 640px**, dialogs become bottom sheets and sheets become full-screen.
- **Footer.** Footers are sticky, with the primary action at the inline end.
- **Retire nested dialogs.** The scrolling `max-h-[85vh] overflow-y-auto` dialog in `quote-form.tsx` (create project inside a quotation) moves to a sheet.

**Feedback**

- **Toasts use Base UI `toast.tsx` only.** `sonner.tsx` and its dead consumer are removed.
- **Toasts confirm significant async outcomes:** saved, sent, generated, approved.
- **Inline `aria-live` text confirms form-local outcomes.**
- **Errors in toasts persist until dismissed** and carry a "Retry" action where retry is safe.

**`Skeleton`, `EmptyState` and `ErrorState`**

- **`EmptyState`** (extends `ui/empty.tsx`) has the variants `no-records`, `no-results`, `filtered-out`, `restricted` and `load-error`. Each has an icon, a title, one sentence, and a next action when permitted.

**Navigation**

- **Active state.** `SidebarMenuButton isActive` is driven by `usePathname()`, including org-slug prefixes. The active item shows a gold indicator bar, a `--sidebar-accent` fill and medium weight.
- **Breadcrumbs** appear in the header on detail pages (e.g. Quotations / Q-2026-014).

### C6. Page composition standard

```
<PageContainer>                       ← single <div>; the shell owns <main>
  <PageHeader title description? breadcrumbs? primaryAction? secondaryActions? meta? />
  <AttentionStrip items />            ← only when ≥1 actionable item; links to filtered views
  <MetricRow metrics />               ← optional; only decision-driving KPIs
  <PrimaryWorkspace />                ← DataTable | form | detail workspace | queue
  <SupportingSection />               ← activity, related records
</PageContainer>
```

**Rules**

- **One `<h1>` per page.** The header's hardcoded company `<h1>` becomes a non-heading workspace label.
- **The primary action lives in `PageHeader`, not the table toolbar.**
- **On mobile**, `PageHeader` collapses secondary actions into an overflow menu, and the primary action stays visible. A sticky bottom action bar is used on long forms.
- **Detail workspace (R2):** three columns at ≥1280px (context 320px · work · status/actions 320px), two at ≥1024px, stacked below that, with the status and next action shown **first** on mobile.

**Per-page "attention" definitions.** These derive only from existing data and permissions.

| Page | Attention items |
|---|---|
| Quotations | Drafts older than N days · sent and expiring within 7 days · expired with no successor · delivery failed |
| Invoices | Overdue with a balance · issued but undelivered |
| Payments | Awaiting verification · confirmed but unallocated |
| Expenses | Already implemented (keep, restyle) |
| Projects | Planned with an accepted quotation but not started · tasks overdue |
| Leads | New and uncontacted · older than 48h |
| Deliveries | Failed, blocked or uncertain |

### C7. Table standard

A single `<DataTable>`, evolved from `components/sales/data-table.tsx` because it already uses TanStack `@tanstack/react-table@9`, server pagination and URL state.

**Anatomy**

1. **Toolbar row 1:** search (inline, 36px, visually hidden label) · status chips with counts · "Filters" popover for secondary filters (dates, currency, division) · column menu · density toggle (optional).
2. **Toolbar row 2:** applied-filter chips with "Clear all". It appears only when filters are active.
3. **Table:**
   - **Header.** The header is sticky, uses `text-table-head` and a `surface-subtle` background, and every sortable header is a button with an icon (`ArrowUpDown`, `ArrowUp`, `ArrowDown`) and `aria-sort`.
   - **Rows.** Rows are 52px by default and 40px in compact density. The identifier column is the row's primary link. Money is right-aligned with `tabular-nums`. Dates use `formatDate`.
   - **Actions column.** The last column holds the `⋯` overflow (`DropdownMenu`). Destructive items sit at the bottom, separated.
4. **Footer:** "Showing 1–25 of 312" · rows-per-page select · numbered pagination (`ui/pagination.tsx`).

**States**

| State | Behaviour |
|---|---|
| Loading | Skeleton rows at the current row height and count; the toolbar stays interactive |
| Refreshing (transition) | Subtle top progress bar and `aria-busy`; rows dimmed to 60% |
| Empty, no records | `EmptyState no-records` with a create action if permitted, and no header row |
| No results | `EmptyState no-results` with the query echoed and "Clear search" |
| Filtered out | `EmptyState filtered-out` with "Clear filters" |
| Error | `ErrorState` with "Retry" (`router.refresh()`); filters are preserved |
| Restricted | `EmptyState restricted`; no data request is made |

**Column visibility**

- **Definitions.** Columns declare `meta: { label, essential?: boolean, defaultHidden?: boolean, mobile?: "title"|"subtitle"|"meta"|"hidden" }`.
- **Essential columns** (identifier and actions) cannot be hidden.
- **The menu** shows labels, not ids, and has a "Reset to default" item.
- **Persistence.** Preferences are keyed `calacot.table.{tableId}.v1` and scoped by Clerk `userId` and `orgId`.
- **Storage.** **V1: localStorage**, wrapped in `try/catch` and falling back to defaults. The repository has no user-preference table, and adding one is a schema change, so it is deferred (F3). The key includes the user id so shared devices don't leak preferences across accounts.

**Responsive behaviour**

- **≥1024px:** the full table.
- **768–1023px:** columns with `mobile:"hidden"` are hidden by default.
- **<768px:** a **card list**. Each card shows the title and status badge, a subtitle line, two meta fields, and the overflow menu. The toolbar collapses to search plus a "Filters" bottom sheet.

The same column definitions drive both representations, so nothing is defined twice.

**Server rules**

- Search, filter, sort and pagination stay server-side through URL params.
- Search is debounced at 350ms (existing).
- **`list-controls.tsx` pages migrate** to the same component through a small `useUrlQuery` adapter. Their GET-form progressive enhancement is kept as the no-JavaScript fallback.

### C8. Responsive principles

| Width | Shell | Content |
|---|---|---|
| 360–639px | Sidebar as an off-canvas sheet; header with menu, title and a primary action icon | Single column; card lists; bottom sheets; sticky form actions |
| 640–1023px | Off-canvas sidebar (≥768px: icon rail optional) | 2-column grids for metrics and charts; tables with reduced columns |
| 1024–1439px | Collapsible sidebar (icon rail persists) | Full tables; 2-column detail workspace |
| ≥1440px | Expanded sidebar | 3-column detail workspace; 3–4 metric columns |

The test matrix is 360, 390, 768, 1024 and 1440px, plus 200% zoom, long names (60+ characters), 1,000-row filters and empty accounts.

### C9. Interaction and accessibility conventions

**Focus**

- **Focus ring.** A 2px `--ring` with a 2px offset, applied consistently to every interactive primitive. `Input` currently uses a 3px ring at 50% opacity; that is unified.

**Motion**

- **Durations.** 150ms for hover and press, 200ms for overlays.
- **Easing.** `cubic-bezier(0.2, 0, 0, 1)`.
- **Reduced motion.** Everything is wrapped in `motion-safe:`.
- **Toasts.** Toasts use 500ms transitions today (`toast.tsx`); that is reduced to 250ms.

**Status and async feedback**

- **Status** always shows text plus a tone, never colour alone.
- **Async work:**
  - The button enters a pending state immediately.
  - Duplicate submits are blocked with the existing `useTransition` / `pending` pattern.
  - Success is announced only after the server responds.
  - Failure keeps the form values.

**Unsaved changes.** Long forms (quotation, expense, project) warn on navigation when dirty.

**Keyboard**

- `/` focuses the table search.
- Esc closes overlays.
- Row overflow menus are reachable with Tab and operable with arrow keys (built into Base UI).

---

## D. Implementation architecture

### D1. Files to reuse, extend, consolidate or remove

| File | Action |
|---|---|
| `app/globals.css` | **Extend**: semantic, surface, elevation and type tokens; fix `--font-heading`; chart tokens; admin-scoped radius under `[data-surface=admin]`; dark `--sidebar-primary` → gold. Brand values are untouched. |
| `components/ui/button.tsx` | **Extend**: `soft` and `destructive-ghost` variants, a `loading` prop, admin size mapping (`sm 32`, `md 36`, `lg 44`) under the admin scope. Marketing defaults are unchanged. |
| `components/ui/badge.tsx` | **Extend**: tone variants (`success`, `warning`, `info`, `neutral`, `destructive`); switch `cn` to `@/lib/utils` |
| `components/ui/card.tsx` | **Extend**: `variant` prop, elevation tokens |
| `components/ui/{input,select,textarea}.tsx` | **Extend**: admin heights, unified ring; add `native-select.tsx` |
| `components/ui/{table,sidebar,tabs,chart,avatar,drawer,message*,bubble}.tsx` | **Consolidate** the `cn` import to `@/lib/utils`; drop the `cn` package once unused |
| `components/ui/empty.tsx`, `skeleton.tsx` | **Reuse**; build `EmptyState`, `ErrorState`, `TableSkeleton` and `ChartSkeleton` on top |
| `components/ui/toast.tsx` | **Keep** as the single toast system; add an `notify()` helper |
| `components/ui/sonner.tsx`, `components/data-table.tsx` (883 lines, no importers) | **Remove** after confirming no imports (verified as zero importers on 19 Nov 2026) |
| `components/ui/chart.tsx` | **Extend** into Calacot chart primitives (G) |
| `components/sales/data-table.tsx`, `table-features.ts`, `columns.tsx` | **Evolve** into `components/data-table/` (generic, `tableId`, column `meta`, persistence, states, mobile cards, numbered pagination) |
| `components/sales/entity-list.tsx`, `list-page.tsx` | **Refactor**: move primary and export actions into `PageHeader`; add attention strips |
| `components/admin/list-controls.tsx` | **Replace** progressively; keep `FilterBar` as the no-JS fallback inside the new toolbar |
| `lib/finance/options.ts` `formatAmount`, `list-controls` `fmtMoney`/`fmtDate`, `lib/utils.ts` `formatAmount`, `lib/design-purchases/model.ts` `formatAmount`, per-page `Intl.DateTimeFormat` | **Consolidate** into `lib/format.ts` (`formatMoney`, `formatDate`, `formatDateTime`, `formatRelative`; Kampala time zone; UGX with 0 decimals, USD with 2) |
| `components/app-sidebar.tsx`, `nav-main.tsx`, `nav-documents.tsx` | **Extend**: `isActive`, gold indicator, width tokens |
| `components/site-header.tsx` | **Rewrite** (presentational only): breadcrumbs slot, no hardcoded `<h1>`, single padding |
| `components/ui/sidebar.tsx` `SidebarInset` | **Change** the element so only one `<main>` exists; pages render `<PageContainer>` as a `<div>` |
| `lib/ui/status.ts` (new) | Status registry for every domain enum (labels and tones) |
| `components/layout/{page-container,page-header,attention-strip,metric-card,metric-row}.tsx` (new) | Page composition primitives |
| `app/(admin)/admin/**/loading.tsx` | **Replace** text with skeletons that match each page layout |
| `docs/design-system.md` | **Keep** for the public site; add a pointer to this document for the admin |

### D2. Separation of concerns

- **Visual primitives stay presentational** and receive data and permissions as props.
- **No primitive calls** `staffContext`, server actions or the database.
- **Pages and server components keep doing what they do now:** reads, permission checks and redirects.
- **Status logic comes from the registry.** Mapping a status to its tone or label is presentation, so it lives in `lib/ui/status.ts`. Business status *derivation* (e.g. "expired" computed in `quotations/[id]/page.tsx`) stays in `lib/sales`, moved there if it is page-local.

### D3. Testing approach (repository conventions)

The repository verifies behaviour with `tsx` and `node` scripts under `scripts/`, not with a component test runner. V1 adds `scripts/verify-design-system.mjs`:

- Status registry completeness, checked against the Drizzle enums.
- Formatter outputs (UGX, USD, negative values, null, Kampala date boundaries).
- Table preference key scoping and fallback.
- A static scan that fails on new `amber-*`, `text-[Npx]` or native `<select>` usage in admin paths.

Visual and responsive checks happen through the browser preview at the five widths, with screenshots recorded per phase. Adding a component test runner is a dependency decision deferred to review (F6).

---

## E. Prioritised rollout plan

Each phase depends on the previous phase being reviewed. "AC" means acceptance criteria.

**Phase 1 — Audit and foundations (this document)**
AC:
- Document reviewed and approved.
- Open decisions in F answered: localStorage vs database preferences, admin button radius, test runner.

**Phase 2 — Tokens and shared components**

Scope:
1. Tokens in `globals.css`: semantic, surface, elevation, type, chart, admin scope; heading font fix; dark sidebar gold.
2. `cn` consolidation.
3. `lib/format.ts` and `lib/ui/status.ts`.
4. Button, Badge (StatusBadge), Card, Input, Select, NativeSelect and Textarea updates.
5. EmptyState, ErrorState and skeletons.
6. Toast consolidation.
7. Chart primitives and formatters (G11).
8. Delete dead `components/data-table.tsx` and `sonner.tsx`.

AC:
- Brand values diff-identical.
- `typecheck`, `lint` and the existing `test:sales`, `test:customer-care` and `test:org-routing` pass.
- `verify-design-system` passes.
- Public marketing pages are visually unchanged at 390px and 1440px (before and after screenshots).
- Contrast is at least 4.5:1 for every text/background token pair in both themes (scripted check).

**Phase 3 — Table system and representative chart (validated on Quotations)**

Scope:
- Generic `DataTable` with toolbar, chips, filters popover, sort icons, column menu with labels, reset and persistence, states, mobile cards and numbered pagination.
- Migrate **Quotations** first.
- In parallel, migrate the **financial reports "Activity by month"** table to a line or bar chart, with a table fallback.

AC:
- Every Quotations workflow (search, filter, sort, page, open, create, export) works exactly as before; URLs are backward-compatible.
- Hidden columns persist across reload and are scoped per user.
- All five empty, error and restricted states render.
- 360px shows the card list with no horizontal page overflow.
- Keyboard-only operation works, including sort, menus and pagination.
- Chart values reconcile to the existing table for the same filters (a scripted comparison).

**Phase 4 — Admin shell**

Scope:
- `PageContainer` and `PageHeader`.
- A single `<main>`, breadcrumbs, the sidebar active state, header rewrite, width tokens.
- The mobile header with a primary action.

AC:
- One `<main>` and one `<h1>` per route (automated DOM check across all admin routes).
- The active nav item is correct for org-slug URLs.
- No route, redirect or permission change; `test:org-routing` passes.

**Phase 5 — Representative workflows**

Pages:

| Page | Exercises |
|---|---|
| Quotations list and detail | Table, status workflow, detail workspace |
| Quotation builder | Long form, catalogue lines, unsaved-changes warning |
| Payments | Approval queue, attention strip |
| Dashboard | Operational KPIs, charts |
| Expense detail | Approvals |

AC:
- A task walkthrough per page (create, approve, record) has the same or fewer steps than today.
- Every async action shows pending, success and failure states.
- No server action, permission or SQL change, other than moving page-local derivations into `lib`.

**Phase 6 — Admin-wide rollout, module by module**

Order:
1. Invoices
2. Clients
3. Projects and Tasks
4. Leads
5. Expenses
6. Documents
7. Catalogue
8. Deliveries
9. Staff, Settings and Payment accounts
10. Financial reports and Reports (charts)
11. Design purchases: remove the marketing layout
12. Customer care: align tokens while keeping the chat-specific layout, which is a documented exception

AC per module:
- No native `<select>`, raw palette colours or arbitrary sizes remain (static scan).
- Loading, error and empty states are present.
- Responsive checks pass at five widths.

**Phase 7 — Quality assurance**

AC:
- Every criterion in brief section 17 and in G12 is checked with evidence (screenshots, scripts, test output).
- A WCAG 2.2 AA pass covers focus order, target sizes, contrast, live regions and reduced motion.
- Regressions are checked with all existing `test:*` scripts.
- Exceptions are documented here.

---

## F. Risks and dependencies

1. **Shared primitives are used by public pages.** `Button`, `Input` and `Card` render marketing and checkout pages too. Mitigation: admin-only changes are scoped under `[data-surface=admin]` or new variants, and every Phase 2 PR includes before and after screenshots of public pages.
2. **Column `meta` and table refactors touch sales list URLs.** Query parameter names (`page`, `size`, `sort`, `desc`, `status`, `currency`, `division`, `payment`, `from`, `to`, `kind`, `search`) must stay unchanged so bookmarks and the proxy rewrite keep working. Status chips need counts, which may require an additional grouped count query in `lib/sales/reads.ts`. That is a read-path change, so it needs a performance check (`EXPLAIN` on staging) before rollout.
3. **Preference persistence.** Database-backed preferences need a new table, a migration and tenant scoping. That is a schema change requiring explicit approval. V1 uses localStorage keyed by user and org.
4. **Attention strips add read queries** to list pages. Each must reuse existing permission checks (`staffContext(…)`), run in parallel, and degrade per item to "could not be checked", following the dashboard's `MetricResult` model, never failing the page.
5. **Charts change how numbers are presented.** A misdrawn or wrongly aggregated chart can mislead financial decisions. Chart data must come from the same functions as the reconciled tables (`lib/finance/reports.ts`, `lib/admin/dashboard`). Phase 3 adds a reconciliation script, and no chart ships without it.
6. **Test tooling.** There is no component test runner (no Vitest, Jest or Playwright in `package.json`). Adding one is a dependency decision. Until then, verification is done with scripts and the browser preview.
7. **The heading font fix is visible everywhere.** Changing `--font-heading` resolution affects `CardTitle` on public pages too. It needs a screenshot diff, and it may need to be scoped to the admin if marketing relies on the current behaviour.
8. **Dark mode is the default** (`defaultTheme="dark"`). Every token and contrast check must pass in dark first.
9. **Uncommitted work in progress.** The working tree has substantial uncommitted changes (catalogue, documents, reports, quote-lines, migrations 0013–0014). Phase 2 should start after that work is committed, to avoid entangling design changes with schema work.
10. **Deployment.** No change in this plan requires a migration or environment change, except the optional preferences table. Nothing is to be deployed or run against production without explicit authorisation.
11. **Customer care and design purchases are bespoke.** Both have bespoke layouts tied to their workflows (a full-height chat, and a public-site-like purchase review). Forcing them into the standard page composition could harm usability. They are treated as documented exceptions that adopt the tokens but keep their structure.

---

## G. Charts, analytics and data visualisation (brief §7B)

### G1. Chart inventory (current state)

| Item | Status |
|---|---|
| `recharts@^3.8.0` | Installed |
| `components/ui/chart.tsx` (shadcn `ChartContainer`, `ChartTooltip`, `ChartLegend`, 372 lines) | Present; its only consumer is dead code |
| `components/data-table.tsx` | Dead (no importers); contains the only chart usage (a demo) |
| Admin charts in use | **None** |
| `--chart-1…5` | Five greys, with no semantic or brand meaning |
| Candidate data sources (already reconciled tables) | `lib/finance/reports.ts`: monthly activity, outstanding/overdue, expenses by division, category and project, project summaries. `lib/finance/receivables.ts`. `lib/admin/dashboard*`. `lib/reports/*` (new, uncommitted). |

**Decision:** standardise on the existing shadcn `chart.tsx` with Recharts. No new library is added.

### G2. Chart selection standard

| Business question | Chart | Source |
|---|---|---|
| Is money coming in vs. going out, month by month? | Grouped bar (invoiced, receipts) plus a line (approved expenses), per currency, never mixing currencies | `monthly` |
| How much is outstanding, and how overdue? | Horizontal stacked bar by aging bucket (current, 1–30, 31–60, 61–90, 90+) | Needs an aging query (a new read) |
| Which divisions spend most? | Horizontal bar, sorted descending | `byDivision` |
| Which projects are over or under collected? | Bullet chart (collected vs. invoiced) per project, or a table with inline bars | `projects` |
| Quotation conversion | Funnel-style horizontal bar (sent → confirmed → invoiced) | Needs a conversion query |
| KPI trend | `MetricCard` with a sparkline (last 6 periods) | `monthly` |
| Expense approval pipeline | Stacked bar (pending, approved unpaid, disbursed) | `pipeline`, `disbursed` |

**Bans:**

- No pies or donuts with more than 4 categories.
- No 3D, no decorative gradients and no dual y-axes for different units.
- No summing of UGX and USD in any chart.
- No smoothed curves for period totals: join monthly or weekly values with straight segments, because a curve implies values between periods that do not exist.

### G3. Chart colour roles (tokens)

| Token | Role | Value basis |
|---|---|---|
| `--chart-primary` | The emphasised series or the selected bar | Gold `--primary`; in light mode drawn with a darker gold stroke for contrast against white |
| `--chart-muted` | Unselected or comparison bars (R3 pattern) | Neutral step 300 (light) / 700 (dark) |
| `--chart-money-in` | Receipts and collections | `--success` |
| `--chart-money-out` | Money actually paid out (disbursements) | Brand rust `--color-brand-accent` |
| `committed` series role | Money committed but not yet paid (approved expenses); dashed | `--chart-money-out` mixed 55% into the card colour |
| `--chart-invoiced` | Invoiced and billed | Neutral strong (brand-black 70% / white 70%) |
| `--chart-overdue` | Overdue, at risk | `--destructive` |
| `--chart-pending` | Pending, awaiting | `--warning` |
| `--chart-grid` | Gridlines | `--border` at 60% |
| `--chart-axis` | Axis labels | `--muted-foreground` |

**Consistency rules**

- **Meanings are fixed across every page.** A metric keeps the same colour wherever it appears; for example, receipts are always `--chart-money-in`.
- **Series are also distinguished by shape.** Lines use solid, dashed or dotted strokes; bars use hatching through an SVG pattern for "pending". The legend labels each series, and tooltips name the series.

### G4. Standard chart anatomy (`ChartCard`)

- **Header:** `text-card-title` title · one-line description · optional info tooltip · optional period selector (`DateRangeFilter`) · optional `⋯` (view data table, export CSV).
- **Body:** a fixed-height plot (240px mobile / 280px tablet / 320px desktop) with padding of 8px top, 16px right and 0px left. The y-axis is abbreviated (1.2M) and the currency is stated in the chart title, so labels never wrap; the x-axis has at most 6 ticks on mobile and 12 on desktop. Gridlines are horizontal only.
- **Footer (optional):** a derived insight sentence, e.g. "Receipts covered 82% of invoicing this period". It must be computed from data, never written as generic copy. Footers can also carry an "Updated hh:mm" note, or a "View invoices →" link to a filtered list.
- **Partial periods:** an incomplete current period is drawn with a dashed or hatched final segment and labelled "partial".

### G5. Interaction standard

- **Tooltip.** The tooltip uses elevation 3 and a 12px radius. It lists the period label, then each series with a swatch, label and `formatMoney` value, and a total where meaningful.
- **Pointer and keyboard.** Tooltips trigger on hover, on focus (keyboard arrow keys move between points via a focusable chart wrapper) and on tap.
- **Legend.** Clicking a legend item toggles its series, and at least one series stays visible.
- **Drill-down.** Clicking a bar or segment navigates to the filtered list (e.g. an overdue bucket → `/admin/invoices?payment=overdue`). Only items the user has permission to open are rendered as links.
- **Range filter.** `DateRangeFilter` writes `from` and `to` to the URL, consistent with the financial reports filters, with the presets "This month", "Last 3 months", "This year" and "Custom".

### G6. Responsive charts

- **Below 640px:**
  - Charts are full width.
  - The legend moves under the plot as compact chips.
  - Axis labels are reduced.
  - Horizontal bars are preferred over vertical ones.
- **Unreadable series.** A chart with more than 6 series, or more than 12 categories, switches to a ranked list with inline bars on mobile.
- **Data table toggle.** Every chart offers "View as table", which also serves as the accessible alternative.

### G7. Data integrity rules

- **Authoritative sources only.** Chart data comes from the same server read functions as the reports tables (`lib/finance/reports.ts`), with the same permission checks (`finance_reports`, etc.) and organisation scoping. No new client-side aggregation is allowed.
- **Currency.** Currency is explicit on every axis and tooltip. UGX and USD use separate charts or separate small multiples.
- **Time zone and periods.** Dates use the Africa/Kampala time zone, as the existing reports already do.
- **Missing data.** Missing periods render as gaps, not zero; zero-filling is allowed only when the query proves the value is zero.
- **Percentage changes** compare equal-length, complete periods. Otherwise the change is hidden.
- **Fixtures.** No fixture or demo data ships in the admin. `components/data-table.tsx` is deleted.
- **Reconciliation.** A script compares chart series totals with the table totals for the same filters.

### G8. Chart states

`ChartSkeleton` keeps the chart's height. Every chart has these states:

| State | Behaviour |
|---|---|
| Loading | Skeleton bars or line at the plot size |
| No data | "No receipts in this period" with the period shown and a "Change period" action |
| Filtered out | "No data matches these filters" with "Clear filters" |
| Error | The message plus a Retry action. The card stays in place and never disappears. |
| Restricted | The card is not rendered, with no data request made, or it shows "Unavailable for your role" when the layout must stay stable |

### G9. Motion

- **Entrance.** Charts enter with a 300ms fade and grow, once, on first render, and are disabled under `prefers-reduced-motion` (Recharts `isAnimationActive={!reducedMotion}`).
- **Data changes** animate over 200ms.
- **Nothing decorative.** No bounce, no looping and no gradient fills beyond a 12% area tint.

### G10. Action-oriented analytics

Every chart card maps to an operational route:

| Chart | Action route |
|---|---|
| Overdue aging | Invoices filtered to overdue; payment verification |
| Money in vs. out | Financial reports detail for the month |
| Expenses by division | Expenses filtered to the division |
| Project collection bullet | Project detail, financial tab |
| Quotation conversion | Quotations filtered by status |

Insight sentences are generated only from computed values, with thresholds that are documented in code.

### G11. Reusable primitives (to build in Phase 2 on top of `ui/chart.tsx`)

| Primitive | Purpose |
|---|---|
| `ChartCard` | Header, body and footer anatomy, plus states |
| `ChartTooltipContent` | Extended for `formatMoney` and series swatches with shape |
| `ChartLegend` | Compact, toggleable |
| `ChartEmptyState`, `ChartErrorState`, `ChartSkeleton` | Chart states (G8) |
| `MetricCard` (with optional `Sparkline`) | KPI with a short trend |
| `DateRangeFilter` | URL-bound period filter with presets |
| `lib/charts/config.ts` | Series role → token map, axis formatters, tick density by breakpoint |

### G12. Representative examples and acceptance criteria

**Example 1 — Money in vs. out (financial reports, Phase 3).**

- **Data:** `r.monthly`, filtered to one currency.
- **Chart:** bars for Invoiced (`--chart-invoiced`) and Confirmed receipts (`--chart-money-in`), with a line for Approved expenses (`--chart-money-out`, dashed).
- **Labels:** the x-axis shows the Kampala month; the y-axis is abbreviated money.
- **Footer:** "Receipts were X% of invoicing in this period", computed.
- **Drill-down:** clicking a month opens the report filtered to that month.
- **Accessible alternative:** the existing monthly table, kept behind "View as table".

**Example 2 — Outstanding by age (dashboard, Phase 5).**

- **Chart:** a horizontal stacked bar per currency, with the buckets current (`--chart-muted`), 1–30 (`--chart-pending`) and 31+ (`--chart-overdue`).
- **Drill-down:** each segment links to the filtered invoices, if the user has `invoices_read`.

**Acceptance criteria:**

- Equivalent charts share their tokens, anatomy and formatting (code review plus the static scan).
- Series colours match the role table on every page.
- Money and dates go through `lib/format.ts`.
- Charts are legible at 360px, with the table fallback available.
- Tooltips work with mouse, keyboard and touch.
- Loading, empty, error and restricted states render.
- The reconciliation script passes.
- Each chart has a documented business question and an action route.

---

## Phase 2 status (19 November 2026)

**Delivered**

| Area | Files |
|---|---|
| Tokens: semantic tones (`success`, `warning`, `info`, `destructive-text`, `-soft`, `-border`), surfaces, elevation (`shadow-e1…e3`), chart roles, control geometry, admin type scale (`type-*` utilities), dark sidebar primary → gold | `app/globals.css` |
| Admin scope | `data-surface="admin"` on the admin `SidebarProvider`; tokens apply from `:root:has([data-surface="admin"])` so portalled dialogs, sheets and popovers inherit them; `admin:` Tailwind variant |
| Formatters and status registry | `lib/format.ts`, `lib/ui/status.ts` |
| Primitives | `Button` (`soft`, `destructive-ghost`, `loading`), `Badge` tones, `StatusBadge`, `Card` (`variant`, `tone`), `Input` / `Select` / `Textarea` geometry, `NativeSelect`, toast motion and icon tones |
| Feedback | `components/feedback/{empty-state,error-state,skeletons,notify}` |
| Metrics and charts | `components/layout/metric-card.tsx`, `components/charts/{chart-card,chart-tooltip,sparkline,date-range-filter}.tsx`, `lib/charts/config.ts`, chart tooltip/grid tokens in `components/ui/chart.tsx` |
| Clean-up | `cn` package imports → `@/lib/utils`; removed dead `components/data-table.tsx`, `components/ui/sonner.tsx` and the unused `sonner`, `cn`, `@dnd-kit/*` packages |
| Verification | `npm run test:design-system` (`scripts/verify-design-system.ts`); dev-only gallery at `/dev/design-system` (404 in production) |

**Deviations from the plan, with reasons**

- **The `--font-heading` wiring was not changed globally.** Marketing utilities (`.title`, `.text-h*`) and `CardTitle` rely on the current resolution, so a global fix would restyle public pages. The admin uses explicit `type-*` utilities instead: Outfit for page and section titles and metrics, Plus Jakarta Sans for card titles. Verified in the browser.
- **Y-axis money ticks are compact numbers ("260M") with the currency in the chart title.** The "UGX 260M" form wrapped onto two lines at desktop width.
- **`tsconfig.json` now excludes the gitignored `tmp/` folder.** A stale backup there (`tmp/menu-flow.backup.ts`) already failed typecheck, and an isolated build copy referenced the removed packages.
- **Light-mode `--chart-primary` is a deeper gold (`oklch(0.64 0.14 80)`).** This meets the 3:1 graphics contrast rule on white. Brand gold is unchanged and still used in dark mode.

**Not yet done (by design, later phases)**

- Pages still use their own formatters, native selects and status labels. Migration happens per module (Phases 3–6), and the regression scan baselines in the verify script only allow those counts to fall.
- Public pages were checked for unchanged button geometry (computed styles on `/thank-you`), not with full before/after screenshot diffs.

---

## Phase 3 status (20 November 2026)

**Delivered**

| Area | Files |
|---|---|
| Generic DataTable: inline search (`/` shortcut, 350ms debounce), status chips, Filters popover, applied-filter chips with "Clear all", sort buttons with icons and `aria-sort`, column menu with labels and "Reset to default", row overflow menu (destructive items last), numbered pagination, background-refresh bar, `no-records` / `no-results` / `filtered-out` / error states, phone card list from the same column definitions, optional columns dropped at tablet width | `components/data-table/{data-table,data-table-toolbar,data-table-pagination,types,use-url-query,use-column-preferences,preferences}.ts(x)` |
| Column preferences | localStorage key `calacot.table.<tableId>.v1.<orgId>.<userId>`; essential columns can't be hidden; corrupt or blocked storage falls back to defaults or session memory |
| Quotations migrated | `app/(admin)/admin/quotations/{page,loading,error}.tsx`, `components/sales/quotations-table.tsx`, `components/layout/page-header.tsx` |
| Representative chart | Financial reports "Activity by month": one chart per currency, the original table behind "View as table", computed insight, partial months marked, click a month to report on it alone. `components/finance/monthly-activity-chart.tsx`, `lib/charts/series.ts` |
| Verification | `npm run test:design-system` adds column-preference, pagination, URL-contract and chart-reconciliation checks |

**Behaviour preserved**

- **URL parameters are unchanged** (`search`, `page`, `size`, `sort`, `desc`, `status`, `currency`, `division`, `from`, `to`).
- **Reads are unchanged.** Data still comes through `parseQuery` and `readList("quotations")`, so permissions and organization scoping are identical.
- **Export is unchanged.** It uses the same API route, now as "Export CSV" in the page header.

**Decisions made during the phase**

- **TanStack was not used for the new table.** Sorting, filtering and paging are all server-side, so TanStack's client row model added generic-type friction (v9 alpha API) without doing any work. The new table uses its own small column spec. TanStack stays for the other sales lists until they migrate.
- **Defaults chosen so Quotations fits about 1,100px without sideways scrolling.** "Email delivery", "Division" and "Updated" are off by default. "Project", "Division", "Email delivery" and "Updated" are also dropped at 768–1023px.
- **New `committed` chart role** (lighter rust, dashed) for approved-but-unpaid expenses. Disbursements use solid rust, because amber would have read as "pending".
- **Period lines use straight segments**, not smoothed curves.
- **Months with no activity are drawn as zero.** The monthly query unions every activity source, so a missing month means there was no activity. Values that can't be parsed stay as "No data".

**Signed-in verification (20 November 2026, live data, org-scoped URL `/calacot-group/admin/...`)**

- **Quotations list:**
  - It loads and filters server-side: Declined returns the filtered-out state, a non-matching search returns no-results, and Clear returns to the list.
  - Row links open the detail page through the proxy.
  - Column choices persist across a reload under `calacot.table.quotations.v1.<org>.<user>`, and Reset clears them.
  - At 375px it shows cards with no page overflow.
- **Financial reports (Jan–Nov 2026):** the monthly chart's totals (invoiced and receipts UGX 2,500,000; expenses 0) equal the report's "Invoiced (issued)" and "Confirmed receipts" figures and the project summary.

**Fixes made because of that check**

- **The admin content column (`SidebarInset`) had no `min-w-0`.** A wide table widened the whole page by 273px instead of scrolling inside its box. This predates the design system and affected every wide admin page; it is fixed in `app/(admin)/layout.tsx`.
- **The table now switches by its container width, not the screen width** (Tailwind container queries), because the sidebar takes up to 256px.
  - Table at 672px+; cards below that.
  - Optional columns at 1024px+.
  - Toolbar in one row at 896px+.
- **Smaller fixes:**
  - The "Showing 0–0 of 0" footer is hidden on empty results.
  - Revision labels no longer break across lines.
  - The detail and new-quotation routes have their own loading skeletons, instead of inheriting the list's.

**Still open**

- **Status chips have no counts yet.** They need a grouped count query and a performance check (risk F2).
- ~~**Two `<h1>` and two `<main>` per page.**~~ Fixed in Phase 4.

---

## Phase 4 status (20 November 2026)

**Delivered**

| Area | Files |
|---|---|
| One `<main>` per page. The admin layout owns `<main id="main-content">` and a "Skip to content" link. `SidebarInset` renders a `<div>`, and 52 admin page, loading and error files render plain containers. | `app/(admin)/layout.tsx`, `components/ui/sidebar.tsx`, `app/(admin)/admin/**` |
| One `<h1>` per page. The header no longer contains a heading. `CardTitle` accepts `as="h1"` without changing its look; 21 page titles and the shared sales list use it. Delivery details gained a `PageHeader`. | `components/ui/card.tsx`, `components/sales/list-page.tsx`, pages |
| Header: 56px tall, sticky, with breadcrumbs derived from the URL (legacy and org-scoped). On phones it shows a 44px back link plus the current page. The company name is now a caption, not a heading. | `components/site-header.tsx`, `components/admin/admin-breadcrumbs.tsx`, `lib/admin/breadcrumbs.ts` |
| Sidebar: 256px wide (was 288px). The current section gets an accent fill, a gold marker and `aria-current="page"`. Child pages keep their section highlighted. | `components/nav-main.tsx`, `components/nav-documents.tsx` |
| `PageContainer` primitive (full or 1200px reading width) | `components/layout/page-container.tsx` |
| `Button` rendered as a link no longer gets `role="button"`. Fixed once in the shared component, which covers nine older call sites. | `components/ui/button.tsx` |
| Verification: `test:design-system` checks for a single `<main>`, one `<h1>` source per page, no heading in the header, breadcrumbs and active-path matching | `scripts/verify-design-system.ts` |

**Signed-in verification, live data**

- **All 30 checked routes pass.** That is 21 sections plus 9 detail pages (client, quotation, invoice, project, document, design order, delivery, staff member, customer care). Each has exactly one `<main>` and one `<h1>`, correct breadcrumbs, the right sidebar item highlighted, and no horizontal overflow at 1280px.
- **Phone, 375px:**
  - The header fits.
  - "Back to Clients" returns to the org-scoped list.
  - The menu sheet highlights the current section.
  - With a real keyboard, the first Tab shows "Skip to content" and Enter moves focus into `<main>`.
- **Routes, redirects and permissions are unchanged.** `test:org-routing` passes.

**Still open**

- **Item catalogue fails before rendering.** It queries `services.updated_by_clerk_user_id`, which the connected database does not have. The page needs the unapplied migration `drizzle-current/0014_quotation_item_catalogue.sql` from earlier work; it is not a design-system issue.
- ~~Most pages still put their title in a card~~: resolved in Phase 6.
- ~~Design purchases still uses its marketing-style layout~~: resolved in Phase 6.

---

## Phase 5 status (20 November 2026)

**Representative workflows delivered**

| Page | What changed |
|---|---|
| Quotations list | **"Quotations needing a decision" strip**, shown only when something is due. It covers sent quotations expiring within 7 days, expired quotations, failed quotation emails and drafts idle for 14+ days. Each item links to the matching filtered list. It is a read-only query over the same `listBase` rows under `quotations_read`, and it degrades to "could not be checked". (`lib/sales/attention.ts`, `components/layout/attention-strip.tsx`) |
| Quotation detail | **Detail workspace.** The header carries the title, number, revision, status, PDF and the forward action. Below it: the scope with a plain next-step note, the draft editor (drafts only), delivery history and activity; beside it, a summary and a revisions timeline. The expiry rule moved from the page into `lib/sales/quotation-status.ts` and is checked against the list query. |
| Quotation builder | **`PageHeader`**, plus an **unsaved-changes guard**: a browser prompt on reload or close, and a confirmation before in-app links. A **sticky total and Save bar**, a success toast after the server confirms, and "Create project" moved from a nested dialog into a side sheet. (`components/feedback/use-unsaved-changes.ts`) |
| Payments | **`PageHeader`**, the collections overview using warning tokens, and the register on the shared `DataTable`, with status chips, filters, mobile cards and row actions. Payments not yet allocated get a "Find invoice to verify" action, which opens the client's issued invoices. (`components/finance/payments-table.tsx`) |
| Dashboard | **Shared attention strip** (hidden when there is nothing to do) and **six `MetricCard`s** with formatted money, icons and links. Restricted or failed metrics say so, never showing zero. |
| Expense detail | **`PageHeader`** with status and total, and **"Next step" as an attention card**. On phones it comes first; on wide screens it sits beside the details. Dates use the shared Kampala formatter. |

**Shared improvements made along the way**

- **`TransitionControls`** (quotations, invoices, deliveries, clients):
  - Plain action names ("Send quotation", "Record acceptance", "Void invoice"…).
  - One primary action, a Cancel button and a loading state.
  - A success toast only after the server confirms.
- **`Activity` and `Deliveries`:**
  - Plain event names ("Quotation: acceptance recorded").
  - Kampala-time dates.
  - Status badges and a timeline layout.
- **`formatDateTime` parses Postgres text timestamps** (`2026-10-06 06:52:31.904619+00`).

**Verification**

- Typecheck shows 0 errors. Lint shows 0 errors (48 warnings, all already present).
- `test:design-system` passes, including new checks for the expiry rule and Postgres timestamps. The raw-colour baseline is now 12.
- `test:sales` and `test:org-routing` pass.
- **Signed in with live data:**
  - The dashboard flags 1 customer-care request.
  - The quotation detail renders `CAL-Q-2026-000001` with its timeline.
  - Payments shows 2 payments awaiting verification. "Find invoice to verify" resolves to `CAL-I-2026-000001`, and the cards fit at 375px.
  - The builder guard prompted on a sidebar link after an edit and stayed on the page.

**Limits and findings**

- **The expense detail page was not exercised in a browser.** The database has no expense requests; it is covered by typecheck, lint and the structure checks only.
- **The quotation email for `CAL-Q-2026-000001` has been Queued since 6 Oct 2026 and never attempted.** The sales outbox worker does not appear to be running against this database. This is operational, not design-system. The attention strip counts failed or blocked deliveries; a "stuck in queue" signal would need a delivery timestamp in the list query.
- **Browser back/forward is not intercepted** by the unsaved-changes guard, because the App Router has no blocking API for it.
- **The dashboard has no chart yet.** "Outstanding by age" needs a new aging query, planned with Phase 6 Financial reports.

---

## Phase 6 status (20 November 2026)

**Admin-wide rollout delivered**

| Module | What changed |
|---|---|
| Clients, Projects, Invoices, Delivery operations | Moved from the old TanStack list (`components/sales/entity-list.tsx`, `columns.tsx`, `data-table.tsx`, `table-features.ts`, now removed) to the shared `DataTable` via `components/sales/sales-table.tsx`. `SalesListPage` now renders a `PageHeader`: Export CSV is a secondary action, and Create client or Create planned project is the primary action. Status, payment and delivery use `StatusBadge`; money uses `formatMoney`. There are status chips, row actions (open, open client, PDF), mobile cards and a matching-total footer. Data, permissions and URL parameters are unchanged. |
| Tasks | `PageHeader`; filters with Apply (secondary) and Reset (ghost, only when filtered); task rows on a card surface with `StatusBadge`, Kampala dates and overdue in the destructive tone; empty and filtered-out states. |
| Catalogue, Documents, Expenses, Financial reports, Leads, Payment accounts, Reports | Title and primary action moved from the first card into `PageHeader` (Reports: Print is a secondary action). |
| Settings | `PageHeader` with the version as meta, a reading-width container, and the pending payment-instruction proposal as an attention card. |
| Client, invoice, project, document and staff detail pages; New expense | `PageHeader` with status in `meta` (`StatusBadge`) and a plain description line. |
| Design purchases (list and detail) | Marketing layout removed. Uses `PageHeader`, status chips, the shared table surface and `StatusBadge` (purchase and payment), with an empty state and Previous/Next paging. The detail page has the reference as `h1`, both statuses in `meta`, and the retry section titled "Messages to resend" with a warning icon. |
| Customer care | Chat layout kept (documented exception). Arbitrary pixel sizes and opacity text replaced with `type-*` utilities and brand shades. |
| Every module | Standard `loading.tsx` (`PageSkeleton` with the page title) and `error.tsx` (`RouteError`, `components/feedback/route-error.tsx`, which retries with `unstable_retry`). |
| Forms | All 54 admin `<select>` elements now use `NativeSelect`, which gained `wrapperClassName` for full-width fields. |

**Static scan (admin):** the baselines are now locked at 0 raw palette colours, 0 arbitrary font sizes and 0 native `<select>` elements. A new check fails on hand-built card or nested-panel containers that bypass the card radius tokens. The sales status lists live in `lib/sales/contracts.ts` (`listStatuses`, `invoicePaymentStates`) and remain the status registry's source of truth.

**Verification**

- Typecheck shows 0 errors. Lint shows 0 errors and 44 warnings, all already present.
- `test:design-system`, `test:sales`, `test:org-routing` and `test:customer-care` pass.
- **Signed in with live data:**
  - Clients, Projects, Invoices (matching total and outstanding footer), Delivery operations, Tasks (empty state), Design purchases list and detail, and the client, invoice, project, document and staff detail pages each render one visible `<h1>`.
  - These pages, plus Settings, Catalogue, Expenses, Leads, Financial reports and Customer care, have no page-level horizontal overflow at 375px.
  - The Design purchases table fits without scrolling at 1280px.

**Limits**

- Responsive checks covered 375px and 1280px, not all five widths.
- Leads, Catalogue, Documents, Expenses, Payment accounts and Reports keep their in-card tables and `FilterBar`; moving them onto `DataTable` needs their queries to adopt the shared list contract.
- The dashboard still has no chart: "Outstanding by age" needs an aging query.

---

## Public site: foundations and forms (20 November 2026)

**Approach (decided):**
- Each division keeps its own character: layout, mood and photography.
- Colours, shades, type and components are shared.
- Foundations first, then the customer forms and flows. The division marketing pages follow later.

**Foundations**

- **Transparency-based brand text replaced by brand shades** in 25 public files (101 classes):
  - Light pages: `text-brand-black/45–65` becomes `brand-black-600` (6.28:1 on brand-white); `/70–75` becomes `700`.
  - Dark pages: `text-brand-white/60–75` becomes `brand-black-200` (10.75:1 on brand-black); `/45–55` becomes `300`; `/35–40` becomes `400`.
  - Borders and see-through overlays on photography keep their transparency.
- **The theme's secondary grey (`--muted-foreground`) is now a brand shade:** `brand-black-600` in light mode and `brand-black-300` in dark. This also lifts it above 4.5:1 everywhere, admin included.
- **Off-brand colours replaced:**
  - Tech "Why Calacot": the radar and tool icons now use lavender, primary, grey-olive and onyx shades.
  - Tech hero glow: lavender and gold on onyx.
  - Real-estate amber link and label: `primary-800`.
  - Architecture lime circles: `brand-green`.
  - Beige and near-black hex backgrounds: onyx shades.
  - Painting hero cream: `primary-50`.
- **New `type-eyebrow` style** for small uppercase labels, used in the footer, forms and real estate.

**Forms and flows**

- **Schedule a call and Start a project, rebuilt:**
  - Every label is linked to its control.
  - Invalid fields are marked and point at an announced message.
  - Autofill hints added for name, email and phone.
  - Loading state on submit.
  - Server and connection failures keep what was typed and say what to do.
  - Fixed: an invalid toast type (`"destructive"` became `"error"`) and a button nested inside a button in the date picker.
  - Removed: a stray Node `process` import from a browser component.
- **Property search card** (not currently rendered on `/real-estate`): its labels are now linked, it uses brand shades, and the search button uses the primary style instead of "glass", which made it hard to read on the white card.
- **Already compliant, unchanged:** the estate enquiry and property lead forms. The account, checkout, thank-you and access pages needed only the shade and theme-grey changes.

**Verification**

- `test:design-system` adds public-site checks:
  - no transparency-based brand text;
  - no off-brand palette or hex colours;
  - no invalid toast types;
  - the theme grey is a brand shade;
  - contrast for every new text shade.
- Typecheck shows 0 errors; lint shows 0 errors and 44 warnings (down from 48).
- In the browser: the schedule form's empty submit marks 6 fields invalid with linked messages, and there are no nested buttons. The Tech radar renders in lavender. The start-project form at 375px in dark mode has linked labels and no overflow.

**Next:** the division marketing pages (home, architecture, painting, interior design, real estate, tech): type scale, eyebrow use and component consistency, keeping each division's look.

### Division pages (20 November 2026)

**Pages:** home, architecture (and the designs list), painting, interior design, real estate and Calacot Tech. Each keeps its own layout, photography and type character.

- **Eyebrow labels unified:** 37 small uppercase labels (10 different letter spacings, sizes from 9px to 12px) now use `type-eyebrow`. The 9–10px labels grew to the shared 11px.
- **Plain white and black text moved to brand colours:** 37 `text-white`, `text-black` and `text-white/…` classes in 14 files now use brand-white, brand-black or onyx shades. The theme-aware `text-foreground/…` and `text-background/…` are unchanged.
- **Buttons:** the navbar menu button and the possibility-section tabs gained `type="button"`, and the tabs gained a visible keyboard focus ring. The other buttons already had labels and focus styles.
- **Checks added to `test:design-system`:**
  - no plain `text-white/black` on public pages;
  - no hand-rolled small uppercase labels (use `type-eyebrow`).
- **Browser:** all 7 pages at 1280px and 375px have exactly one `<h1>`, no skipped heading levels and no horizontal overflow. All images have alt text. (An automated contrast sweep could not read the browser's `lab()` colours, so contrast relies on the token checks.)

**Found, not changed:** the fixed public navbar has no background once the page scrolls, so the Calacot logo can sit over page headings.
