# Calacot Admin System Audit

Audit date: 17 November 2026. Scope: repository review and isolated checks. This is a read-only application audit; no production database, accounts, messages, or migrations were touched. Source evidence establishes implementation or a defect in the code, not that a production deployment works. No authenticated browser session, real provider, live schema, production configuration, or mobile device was inspected. “Confirmed” below means confirmed in source or isolated tests, with that distinction stated; “suspected” requires runtime verification. No module is certified fully operational end to end.

## 1. Executive summary

The commercial system has meaningful server-side authorization, versioned quotations, payment allocation and outbox logic, with isolated sales and care tests passing. The deployed state and actual delivery remain unverified. The most immediate confirmed problems are sample financial metrics presented as a real dashboard, numerous navigation links to absent routes, and gaps in lead conversion and project execution. Payment and purchase fulfilment must not be declared reliable merely because isolated tests pass. The care and sales subsystems use different authorization models; staff role usability and production deployment require validation.

## 2. Architecture

Next.js 16 App Router and React 19 serve public, authenticated account and admin pages. `proxy.ts` redirects legacy `/admin` URLs and rewrites organization-scoped URLs; Clerk sessions and a configured organization are checked by `lib/sales/permissions.ts`. Admin server components call server-only reads and server actions. Drizzle and SQL functions operate on PostgreSQL/Neon (`database/schema`, `database/sales-functions.sql`, `drizzle`). Sales documents use private artifacts, PDF generation, outbox jobs, Resend and WhatsApp; customer care has webhook, queue, worker and admin functions. Design purchases have a separate payment/access lifecycle and notifications. Sentry is configured in `next.config.ts`. Deployment schedules, database state, external provider credentials and health were not inspected.

## 3. Module findings

Status below describes source coverage, not live success. Paths identify the primary evidence and remedy scope.

| Module | Implemented in source / integration | Gaps, risk and verification |
|---|---|---|
| Dashboard/navigation | Sidebar, scoped route rewriting. `components/app-sidebar.tsx`, `proxy.ts`. | **Confirmed P1:** demo metrics and data; dead destinations (C1, C2). Replace with authorized live aggregates and remove or implement unavailable links. Runtime rendering untested. |
| Leads/CRM | Leads list, search, status and notes backed by `leads`; project and call intake actions. `lib/admin/reads.ts`, `lib/admin/actions.ts`, `app/actions`. | **Confirmed P1:** no lead-to-client conversion on lead screen (C3); property enquiries use separate intake tables. Link and deduplicate intake sources with audited conversion. Form intake and production persistence untested. |
| Clients | List/detail, save/archive and duplicate search via sales actions and SQL. `lib/sales/actions.ts`, `lib/sales/reads.ts`, `app/(admin)/admin/clients`. | Partial CRM integration: lead linkage/conversion missing in admin; runtime CRUD, duplicate handling and role access untested. Remedy C3 and verify with disposable clients. |
| Projects | List, create, detail, client relationship and guarded start action. `app/(admin)/admin/projects`, `lib/sales/actions.ts`. | **Confirmed P1:** no task route or project completion action in admin (C4). Add controlled lifecycle and tasks. Live workflow untested. |
| Quotations | Creation, versions, commands, PDF and linked project; SQL transactional workflow. `app/(admin)/admin/quotations`, `lib/sales/actions.ts`, `database/sales-functions.sql`. | Isolated tests cover repeat confirmation and snapshots; production approval, delivery, and installed functions untested. Verify exact version and permissions on isolated deployment. |
| Invoices | Detail, PDF, issuance via quotation workflow, void and payment form. `app/(admin)/admin/invoices`, `lib/sales/actions.ts`. | Isolated ledger tests passed; live invoice issuance, void and storage untested. Reconcile safely in staging before relying on balances. |
| Payments | Read-only list; record/verify/allocate on invoice; role checked server-side. `lib/admin/reads.ts`, `components/sales/payment-form.tsx`, `lib/sales/actions.ts`. | Separate verification and allocation are tested in fixture, not against real bank or live schema. List directs users to invoice, causing extra navigation. Add safe reconciliation tests and clear links. |
| Expenses | Filtered, paginated database read and totals. `app/(admin)/admin/expenses/page.tsx`, `lib/admin/reads.ts`. | **Confirmed P2:** no create/edit/approval action in this page; a read-only register cannot support complete expense processing. Add only after requirements and permission design. |
| Tasks | Schema exists `database/schema/tasks.ts`. | **Confirmed P1:** sidebar `/admin/tasks` has no route or task UI (C2/C4). No evidence of integrated task completion. Implement project-linked tasks and transitions. |
| Design purchases | Order listing/detail, customer payment reference, staff confirmation/rejection, access activation and notification paths. `lib/design-purchases/actions.ts`, `transitions.ts`. | **Confirmed P1:** payment confirmation immediately marks order completed and access active; distinct delivery/fulfilment confirmation is absent from this transition (C5). Real fulfilment and notifications untested. Define fulfilment semantics and track delivery independently. |
| Customer care/WhatsApp | Webhook, menus, conversation modes, request handling, staff replies and knowledge tools. `lib/customer-care`, `lib/whatsapp`, `app/api/whatsapp`. Mocked care tests passed. | No live inbound/outbound or staff follow-up verification; **suspected P1** follow-up may remain outside project/task management because no task UI exists. Provide accountable assignment and test provider callbacks in staging. |
| Delivery operations | Admin route and sales outbox/attempts with worker. `app/(admin)/admin/deliveries`, `lib/sales/worker.ts`. | Mocked retries and capture tested. Scheduler deployment, secrets, storage, external sends, uncertain outcomes and operational alerting untested. Verify in staging with captured destinations and monitoring. |
| Documents/reports | Commercial PDF endpoints and purchase invoice exist. `app/api/sales`, `app/api/design-purchases`. | **Confirmed P2:** general Documents and Reports sidebar destinations have no routes (C2); PDFs do not constitute a document repository or reports. Define and implement required capabilities. PDF access in production untested. |
| Team/roles | Clerk org role and custom-permission checks on sales server operations; admin-only care/purchases. `lib/sales/permissions.ts`, `lib/design-purchases/permissions.ts`. | **Confirmed P2:** Team route absent; no in-app role management. Role definitions are code plus Clerk, and care requires org admin regardless of sales grants. Verify least privilege and staff onboarding with test identities. |
| Settings/company | Payment instructions read environment values in `lib/company.ts`; organization setup guard. | **Confirmed P2:** Settings route absent; no admin company settings. Configuration and change control are external, live values intentionally uninspected. Document owners and provide a controlled configuration workflow if required. |

## 4. Confirmed issues and reproduction

- **C1 — P1, misleading dashboard.** Files: `app/(admin)/admin/dashboard/page.tsx`, `components/section-cards.tsx`, `components/chart-area-interactive.tsx`, `app/(admin)/admin/dashboard/data.json`. Open Dashboard: revenue, customer counts and trends are literal sample values, the chart uses 2024 fixture data and the table imports JSON. Impact: false financial/operational decisions. Remedy: suppress or clearly label fixtures immediately; replace with permission-scoped live aggregates and explicit empty/error states. Source-confirmed; browser untested.
- **C2 — P1, dead navigation.** File: `components/app-sidebar.tsx`; route tree `app/(admin)/admin`. Click Inbox, Tasks, Properties, Services, Team, Settings, Get Help, Search, Documents, Reports or Knowledge Base: their declared paths have no corresponding admin page. Impact: 404s and misleading capability. Remedy: remove/disable with explanation until implemented or add routes. Customer-care knowledge exists at `/admin/customer-care/knowledge`, distinct from the advertised Knowledge Base. Static route analysis; browser untested.
- **C3 — P1, intake cannot be converted in the admin lead flow.** Files: `app/(admin)/admin/leads/page.tsx`, `lib/admin/actions.ts`, `database/schema/legacy-links.ts`, `database/schema/property-intake.ts`. Open a lead's details: only status and notes can be saved; no conversion or client link action is rendered. Impact: manual re-entry, duplicates and lost attribution; separate property intake is not included in `readLeads`. Remedy: create an idempotent, permission-checked conversion with duplicate matching and provenance, and provide a unified intake view. Source-confirmed; live records untested.
- **C4 — P1, project execution stops at start.** Files: `app/(admin)/admin/projects/[id]/page.tsx`, `lib/sales/actions.ts`, `database/schema/tasks.ts`, sidebar. Open a project: the exposed transition starts a planned project; task navigation has no route and the page has no completion action. Impact: staff cannot manage and complete the full workflow in this admin. Remedy: add task ownership, progress and guarded project completion, with audit history. Source-confirmed.
- **C5 — P1, purchase completion conflates payment and fulfilment.** Files: `lib/design-purchases/transitions.ts`, `lib/design-purchases/actions.ts`, `database/schema/design-purchases.ts`. Confirm an eligible payment: `reviewChanges` sets `purchaseStatus=completed`, `paymentStatus=confirmed` and `accessStatus=active` together. Impact: completion can be reported before an independently tracked delivery; whether access activation itself constitutes fulfilment is a business decision. Remedy: explicitly define entitlement versus delivery and add separate fulfilment evidence/status when delivery is required. Source-confirmed; live action not executed.
- **C6 — P2, lead save can fail silently.** Files: `lib/admin/actions.ts`, `app/(admin)/admin/leads/page.tsx`. Submit invalid lead data: validation returns without an error response; successful submission likewise has no explicit confirmation. Impact: staff cannot distinguish rejection from success. Remedy: return typed validation/action state and announce success/errors accessibly. Source-confirmed; browser untested.
- **C7 — P2, unlabeled lead controls.** File: `app/(admin)/admin/leads/page.tsx`. Open a lead: status select has no associated label and notes rely on placeholder. Impact: assistive-technology users may not know control purpose. Remedy: explicit labels and announced action feedback. Source-confirmed; assistive technology untested.

## 5. Workflow traces

1. **Website enquiry → lead → client:** project/call actions insert `leads`; list reads it and permits notes/status. Conversion/link to client is absent (C3). Property intake is separate; public submission and notification delivery untested.
2. **Client → project → quotation:** client/project/quotation create and relationship checks are implemented in sales actions and SQL. Isolated tests exercise relationship validation; authenticated UI and installed production SQL remain untested. There is no automatic lead provenance in the admin flow.
3. **Approval → invoice:** quotation commands operate on versions; isolated tests cover repeated confirmation and a single invoice. Customer approval, worker scheduling and real delivery are untested. Staff and customer transitions must be checked against actual business policy.
4. **Invoice → verified payment → balance:** invoice page provides record/verify form; `sales_payment` and allocation calculations drive balance. Fixture tests cover separation and ledger balances. Live payment verification, reconciliation, concurrency and schema drift untested.
5. **Project → tasks → completion:** project can be started with a linked quotation version; task UI and completion control absent (C4).
6. **Design purchase → payment → fulfilment:** user submits reference, admin reviews, transition activates access and marks completed (C5). Actual design delivery and downstream notification delivery untested.
7. **WhatsApp → care → follow-up:** webhook, menu, queues, staff mode and replies exist; isolated tests exercise handoff, opt-out and mocked transport. End-to-end provider integration and accountable follow-up to a task/project remain unverified; task UI absent.

## 6. Missing features

Tasks and project completion; in-app lead conversion and unified intake; expense mutation/approval; general document repository and reporting; team/role and settings interfaces; real dashboard metrics; advertised sidebar routes listed in C2. These are absence findings in the inspected admin route tree, not claims about external tools.

## 7. Security and reliability

- **Confirmed controls, not certification:** `staffContext` checks Clerk user, configured org, role/custom grants; sales actions request specific permissions and validate input. Design-purchase and care administrative actions require org admin. PDF and export endpoints invoke server-side staff checks. `proxy.ts` strips spoofable org header. Isolated routing and care authorization tests passed.
- **P1 suspected, tenant boundary:** `lib/admin/reads.ts` and `lib/admin/actions.ts` query/update `leads` without an organization predicate; `database/schema/lead-intake.ts` should be assessed against intended data ownership. Present `staffContext` restricts access to one configured org, so a cross-tenant exploit is **not confirmed**. Remedy: document single-tenant assumption or add ownership and server-side predicates before multi-tenancy; test with isolated organizations.
- **P1 untested, live database drift:** SQL functions/migrations and Drizzle schemas are tested on disposable PGlite, not the deployed PostgreSQL schema. Impact: production commands may fail or behave differently. Remedy: read-only staging/schema comparison and Postgres integration tests using explicitly isolated database. No live query was made.
- **P1 untested, notification reliability:** sales outbox fixture covers deduplication and uncertain delivery; actual scheduler, providers, webhook verification, storage policies, alerts and design-purchase notification execution were not verified. Remedy: staging capture-mode integration, monitor queue age/failures, and review recovery without duplicate sends. Files: `lib/sales/worker.ts`, `lib/customer-care/worker.ts`, `lib/design-purchases/email.ts`.
- **P2 suspected, performance:** list reads perform count plus page queries and some totals; production cardinality, indexes and execution plans are unknown. Files: `lib/admin/reads.ts`, `lib/sales/queries.ts`. Remedy: analyze staging query plans with representative volumes and add indexes only after measurement.
- **P2 authorization usability:** admin-only care/purchases differ from granular sales roles (`lib/design-purchases/permissions.ts`, `lib/sales/permissions.ts`); staff needing care without org admin may be blocked. Review intended role matrix and test negative and positive cases. No unauthorized access demonstrated.
- **P2 error handling:** C6; other provider and DB failure paths need staging fault injection. Payment commands contain validation and SQL transaction/idempotency safeguards in source and isolated tests, but concurrent real PostgreSQL behavior is untested.

## 8. UI/UX

C1/C2/C6/C7 are confirmed by source. Lists have search, pagination and empty states, but interaction consistency and keyboard focus have not been assessed in a browser. Tables use horizontal overflow, which is not proof of usable mobile layouts. **P2 untested:** responsive screens, keyboard navigation, contrast, screen-reader announcements, loading and network error states across modules. Remedy: run an authenticated staging walkthrough at mobile and desktop sizes, keyboard and accessibility checks, with screenshots and disposable data. **P2 confirmed:** payment verification lives on invoice detail while Payments is a listing (`app/(admin)/admin/payments/page.tsx`); provide contextual invoice navigation to reduce lookup. Severity and remedy for each confirmed issue are in section 4.

## 9. Checks and actual results

- `npm.cmd run typecheck -- --incremental false`: **PASS**, exit 0.
- `npm.cmd run lint`: **PASS**, exit 0, 58 warnings, 0 errors across repository; includes unused navigation imports and public-site warnings.
- `npm.cmd run test:sales`: **PASS**, isolated PGlite and injected provider adapters; migrations, relationships, versions, invoice/payment separation, balances, outbox and PDF fixtures. It does not prove deployed PostgreSQL or delivery.
- `npm.cmd run test:customer-care`: **PASS**, isolated PGlite/mocked transport; menu, handoff, replay, authorization, reply and worker tests. Expected mocked timeout/error logs appeared.
- `npm.cmd run test:org-routing`: **PASS**, mocked session and routing cases.
- Initial test attempts failed inside sandbox (`uv_os_get_passwd` and esbuild directory access); reruns outside sandbox passed. PowerShell `npm` initially hit execution policy; `npm.cmd` was used.
- **Production build: NOT RUN.** The repository has production-capable environment files and build configuration includes Sentry integration; an isolated build with dummy credentials and blocked external services was not established. Running the ordinary command could read real configuration or contact external services. Build correctness remains unknown.
- **Postgres integration suites: NOT RUN:** no independently verified disposable PostgreSQL target. No production schema queried, migrations run, or resets performed.
- Route inventory and source authorization/schema consistency: static analysis only. Live RLS, Clerk roles, provider endpoints, deployment jobs, visual/mobile/accessibility behavior and production data not tested. Tests write local disposable fixture artifacts under `tmp`; application code was not edited.

## 10. Prioritized repair backlog

| Priority | Work | Evidence / remedy |
|---|---|---|
| P0 | No confirmed P0 identified in available evidence. | Do not infer absence of critical production vulnerabilities from this limited audit. |
| P1 | Remove/label fictitious dashboard data. | C1; replace with permission-scoped real metrics. |
| P1 | Correct dead navigation and establish route ownership. | C2; hide unavailable routes or implement them. |
| P1 | Introduce audited, idempotent lead conversion and intake visibility. | C3; preserve provenance and prevent duplicates. |
| P1 | Complete project task and completion lifecycle. | C4; ownership, statuses and permission-checked transitions. |
| P1 | Separate purchase payment/access from fulfilment evidence. | C5; confirm business semantics first. |
| P1 | Verify deployed schema and notification pipelines in staging. | Section 7; disposable Postgres, capture providers, scheduler and monitoring. |
| P2 | Improve lead feedback/accessibility and expense workflow. | C6/C7 and module table. |
| P2 | Define roles, settings, document and reporting requirements. | Module table; server-enforced least privilege. |
| P2 | Measure list performance and complete mobile/accessibility review. | Section 7–8; representative data and authenticated staging. |
| P3 | Clean lint warnings and harmonize controls and table patterns. | Section 9; no errors, 58 warnings. |

## 11. Recommended implementation sequence

1. Review this report and confirm dashboard and fulfilment business definitions; establish a disposable staging database, test Clerk organization, captured providers and isolated build pipeline.
2. Stop misleading dashboard and dead links; add regression checks for navigation and permission-scoped metrics.
3. Reconcile deployed schema read-only against migrations, then verify sales/payment and worker recovery on isolated PostgreSQL before changes.
4. Deliver lead conversion and provenance, then project tasks/completion, with transaction, authorization and idempotency tests.
5. Separate design fulfilment from payment where required; verify care follow-up and notification operations in captured staging.
6. Address expense, team/settings, documents/reporting, accessibility, performance and remaining lint in priority order.
