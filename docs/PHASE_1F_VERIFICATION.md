# Phase 1F verification: document management and operational reporting

Scope: the centralized document library at `/admin/documents` and the operational reports at `/admin/reports`.
Status: implemented and verified locally against isolated development resources only. **Nothing has been deployed.** No production migrations were run, and no production data, Clerk settings or customer communications were touched.

## 1. Features implemented

**Documents (`/admin/documents`, `/admin/documents/[id]`)**
- One library for documents linked to a client, project, task, milestone, employee (staff record) or company record. Existing commercial artifacts (quotations, invoices, receipts, expense evidence) appear in the same library, read-only.
- Categories: contract, drawing, brief, permit, photo, report, policy, staff record, property document, other.
- Upload accepts PDF, JPEG, PNG, WebP, .docx and .xlsx up to 20 MB. The file type is detected from its content, not its name. Macro-enabled and legacy Office formats are refused.
- **Versioning:** "Upload new version" creates a new immutable row in the same document family. Every earlier version stays downloadable, and only one successor per version is allowed.
- **Archival** (admins only) requires a reason and archives all versions together. Nothing is deleted. Archived documents remain visible under the Archived filter and in the audit trail.
- **Financial families are protected:** quotations, invoices, receipts, expense evidence, and anything linked to an invoice, quotation version or expense cannot be revised or archived.
- **Filters:** search, category, linked record type, status (active/archived), upload date range; paginated.
- **Detail page:** version history and an activity panel showing uploads, versions, archival and every download.
- **Record pages:** a Documents card on client and project pages. The project card also includes the project's tasks and milestones. Uploads from a record page are pre-linked to that record.

**Reports (`/admin/reports`)**
- **Sales:**
  - leads by status;
  - lead conversion;
  - quotations by status;
  - invoiced amounts;
  - outstanding customer balances;
  - confirmed collections.
- **Projects:**
  - projects by status;
  - project progress;
  - overdue tasks;
  - project expenditure.
- **Finance:**
  - expenses by category;
  - expenses by division;
  - approved versus paid expenses;
  - pending disbursements;
  - outstanding invoices.
- **Staff:** workload by employee.
- **Filters:** date range (Kampala dates), division, project, currency. UGX and USD are always shown separately and never combined or converted.
- **Export CSV** on every table. Each export carries a preamble saying it is an operational report, not an audited financial statement. The **Print** button uses a print layout that hides the sidebar and header.

## 2. Existing infrastructure reused
- **Permissions:**
  - `staffContext` and the existing role grants;
  - `financeMutation`, which provides the live Clerk check, origin check, rate limit and staff mirror;
  - `financeMessages` for user-facing errors.
- **Storage:** the existing private object storage in `lib/sales/storage.ts` (S3-compatible, with a local capture mode in development). No second document store was created; `storePrivateObject` only gained a size-limit parameter.
- **Documents:** the existing `documents` and `document_links` tables, extended additively. Commercial artifact registration (the quotation/invoice upsert) is unchanged, and the artifacts keep their current owners.
- **Reporting queries:** finance figures come from the existing `readFinancialReports`, `listBase` and `balanceExpression`. There is no second ledger and no new accounting logic.
- **Staff and audit:** suspension, removal and eligibility from Phase 1E; `audit_logs` for every upload, revision, archive, download and export.
- **UI:** `FilterBar`, `Pager`, the shadcn/Base UI components, and the existing sidebar navigation model.

## 3. Files changed

**New**
- `drizzle-current/0013_document_management.sql`
- `drizzle-current/meta/0013_snapshot.json`
- `lib/documents/files.ts`: type sniffing, safe file names, limits
- `lib/documents/access.ts`: read and write rules per linked record
- `lib/documents/reads.ts`
- `lib/documents/actions.ts`: archive
- `lib/documents/labels.ts`
- `lib/reports/operational.ts`
- `lib/reports/csv.ts`
- `app/api/documents/route.ts`: upload and revise
- `app/api/documents/[id]/route.ts`: download
- `app/api/reports/export/route.ts`
- `app/(admin)/admin/documents/`: list and detail pages, with loading and error boundaries
- `app/(admin)/admin/reports/`: page, with loading and error boundaries
- `components/documents/document-forms.tsx`
- `components/documents/record-documents.tsx`
- `components/reports/print-button.tsx`
- `scripts/verify-documents-reports.mjs`
- `scripts/verify-documents-concurrency-postgres.mjs`

**Modified**
- `database/schema/documents.ts`: new categories, family and archive columns, milestone/staff/company links
- `lib/sales/permissions.ts`: `documents_read`, `documents_write` and `documents_archive`, all three in the sensitive set
- `lib/sales/storage.ts`: per-call size limit
- `lib/admin/staff-sync.ts`: clears the cached live-membership check when a change or removal is detected
- `lib/finance/context.ts`: two new messages
- `lib/admin/navigation.ts` and `components/app-sidebar.tsx`: Reports and Documents navigation entries
- `app/(admin)/admin/clients/[id]/page.tsx` and `app/(admin)/admin/projects/[id]/page.tsx`: Documents card
- `app/globals.css`: print rules
- `drizzle-current/meta/_journal.json`: 0013 entry
- Test harnesses `scripts/verify-staff-admin.mjs`, `verify-staff-reconciliation.mjs` and `verify-clerk-webhook-signature.mjs`: updated for the new sensitive permission and mock export

## 4. Database migrations

**`0013_document_management.sql`**: one migration, additive. It is reviewed and compatible with the `drizzle-current/` chain 0000–0012.
- **`documents` table:**
  - new nullable columns `family_id`, `archived_by` and `archive_reason`;
  - `documents_kind_check` dropped and re-added with the wider category list;
  - new `documents_archive_check`;
  - new partial unique index `documents_single_successor_uq`;
  - new index `documents_family_idx`.
- **`document_links` table:**
  - new nullable `milestone_id` and `staff_id` (organization-scoped foreign keys) and `company_record` (boolean, default false);
  - `document_links_one_parent_check` dropped and re-added to cover the new link types;
  - new indexes on client and project.
- **Functions and triggers:**
  - `document_guard` trigger: stored content is immutable and archival is one-way, while identical-value upserts are still allowed;
  - `document_links_guard`: links cannot be updated or deleted;
  - `document_is_financial`;
  - `document_upload`: validates the content-addressed key, type, size and link target per type, and writes the audit entry;
  - `document_archive`: locks the family, refuses financial families and writes the audit entry.
- **`division_enabled`** is replaced with a hardened body. An empty divisions list now means "not configured", where before it disabled every division. This fix was first written into 0012 during development, then moved into 0013, so **0012 is byte-identical to its committed version**.

**Verified:**
- The full chain applies from an empty database in one transaction on PostgreSQL 17.5 and on PGlite.
- The Neon test fixture was upgraded in place. Existing quotation and invoice artifact rows were kept, and the commercial upsert still works under the new guard.

## 5. Security controls
- **Authorization:**
  - Every read, download, upload, revision, archive and export runs on the server.
  - Downloads, uploads and exports use a fresh live Clerk membership check with no cache, so removal or suspension takes effect immediately.
  - Staff sync also clears the cached live check.
- **Record-level access:**
  - A user sees a document only if they can read every record it is linked to; the most restrictive link wins.
  - Unlinked documents are admin-only.
  - Staff records need `staff_manage`; company records need `settings_manage` to write.
  - Denials return 404, so no existence is revealed.
- **Uploads:**
  - File type is detected from the bytes, and OOXML files are checked for their required parts and for no VBA project.
  - Size is capped at 20 MB, both in the request and in the database.
  - Authorization runs before anything is written to storage.
  - Storage keys are content-addressed (`documents/<id>/<sha256>`), and an existing id can never have its bytes replaced. Retrying with the same bytes is idempotent; different bytes get a 409.
  - Same-origin is required.
- **Downloads:**
  - The private storage key never reaches the browser, and there are no public or permanent URLs.
  - Response headers: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, a sandboxed CSP, and `Referrer-Policy: no-referrer`.
  - Only PDF and images open inline; Office files download as attachments.
  - Every download is audited.
- **Immutability:**
  - Database triggers block content changes and link rewrites.
  - Financial documents cannot be revised or archived.
  - Issued quotations and invoices are untouched.
- **Concurrency:** revisions and archival lock the family, and a second revision of the same version conflicts.
- **CSV:**
  - Text starting with `= + - @`, tab or carriage return (after optional whitespace) is prefixed with `'`.
  - All fields are quoted, the file has a UTF-8 BOM, and it opens with a disclaimer preamble.
- **Reports:** each section and table is gated by existing permissions. Currencies are never combined, and the pages carry no audited-statement wording.

## 6. Test results

All suites below were run on 2026-11-18/19 and passed.

| Suite | Result |
|---|---|
| `verify-documents-reports.mjs` (PGlite) | PASS, 7 groups: upload validation, access per link, versioning, financial immutability, archival, staff suspension/removal/eligibility, reports and CSV safety |
| `verify-documents-concurrency-postgres.mjs` (real PG 17.5, two connections) | PASS, 6 cases: chain applied; competing revisions; archive vs revision in both orders; duplicate concurrent upload; commercial upsert |
| `verify-admin-concurrency-postgres.mjs` | PASS, 5 cases |
| `verify-finance-concurrency-postgres.mjs` | PASS, 8 cases |
| `verify-staff-admin.mjs` | PASS, 18 groups |
| `verify-finance-expenses.mjs` | PASS, 17 groups |
| `verify-phase1e-history.mjs` | PASS |
| `verify-staff-reconciliation.mjs` | PASS |
| `verify-clerk-webhook-signature.mjs` | PASS |
| `verify-phase1e-static.mjs` | PASS: 17 API routes clear of the proxy tenant pattern; all submit buttons typed |

**Other regression suites that passed:**
- finance documents;
- lead assignment;
- project-manager assignment;
- the three project suites;
- dashboard;
- lead management;
- `test:sales`;
- `test:customer-care`;
- org routing.

**Other checks:**
- **TypeScript:** clean, apart from a stale backup file under `tmp/` that is not part of the app.
- **ESLint:** 0 errors on all Phase 1F paths.
- **Production build:** run on an isolated copy, exit 0, 53/53 pages. It includes `/admin/documents`, `/admin/documents/[id]`, `/admin/reports`, `/api/documents`, `/api/documents/[id]` and `/api/reports/export`.

## 7. Browser acceptance results

**Setup:**
- Local dev server on the isolated build copy.
- Neon test project database `phase1e_acceptance_fixture`, upgraded to 0013.
- The Clerk development instance and its isolated test organization.
- Sign-in used one-time development sign-in tokens, so no passwords were typed.
- One test client, project, milestone and task were seeded into the fixture, because it had none.

| Check | Result |
|---|---|
| Admin: upload a PDF linked to a project through the library form | Pass. Listed with label, link, uploader and version. Stored bytes match the recorded SHA-256. |
| Admin: upload a PNG from the client page's Documents card (pre-linked) | Pass |
| Download | Pass for PNG: 200, exact bytes, `image/png` inline, `no-store`, `nosniff`, sandbox CSP, `no-referrer`; every download audited. For PDF the server returned 200 each time (server log and audit trail), but a browser extension in the test Chrome profile replaced the PDF response with an empty 204. See remaining issues. |
| New version | Pass. v2 is current, v1 is kept and openable, and the activity panel shows it. |
| Archive | Pass. An empty reason is blocked; both versions are archived with the reason shown, and the revise and archive controls disappear. |
| Reports, admin | Pass. All four sections render; per-currency and "not audited" wording is present. |
| CSV export | Pass. 200 `text/csv` attachment, `no-store`, BOM present. A test project code `-2+3` was exported as `'-2+3`. |
| Print layout | Pass. Print CSS hides the sidebar and header; Export and Print controls are `print:hidden`. |
| Removed member (finance test user, removed in Phase 1E) | Pass. All downloads, upload and export return 404. |
| Unapproved `org:member` | Pass. Redirected to Access pending; every document and export endpoint returns 404. |
| Same user temporarily given `org:project_manager` (reverted afterwards) | Pass, see the breakdown below this table. |
| Mobile (375 px) | Pass. No horizontal page overflow on the documents list, document detail, reports (sales and projects), client page or project page. |

**Project-manager breakdown:**
- **Can do:** sees the client photo and the archived project contract.
- **Cannot see:** the confidential employee record is not listed, its detail page shows nothing, and downloading it returns 404.
- **Missing controls and sections:** there is no Archive button; only the Sales and Projects report sections appear; the Staff and Finance exports return 404.
- **Forged uploads refused:**

  | Forged request | Response |
  |---|---|
  | Upload linked to an employee record | 404 |
  | Upload linked to a company record | 404 |
  | Revision of the hidden staff record | 404 |
  | Revision of an archived family | 409 |
  | EXE bytes named `.pdf` | 400 |

**Fixed during acceptance:**
1. **Labels:** category and linked-record labels showed raw values (`contract`, `project`). The cause was that label maps exported from a `"use client"` module reach server components as client references, not objects. They now live in `lib/documents/labels.ts`.
2. **Dev warning:** Base UI warned about link-rendered buttons on the document detail and reports pages. Added `nativeButton={false}` to them.
3. **Migration history:** the `division_enabled` fix was moved out of committed migration 0012 into 0013 (see section 4).

After these fixes, the suites, lint, static guard and build were re-run and pass.

**Cleanup after acceptance:**
- The outsider's role was reverted to `org:member` and the mirror resynced.
- The test project's name and code were restored.
- The test sessions were signed out; no active sessions remain.
- The dev server and the local PostgreSQL were stopped.

## 8. Remaining issues
- **PDF open in a clean browser not observed.** In the test browser profile an extension intercepted PDF responses. Server-side delivery and auditing were verified, but before rollout someone should open one PDF in a clean browser profile on staging.
- **Garbled separators on the project page (existing issue).** `app/(admin)/admin/projects/[id]/page.tsx` already contains mis-encoded `·` separators in the committed version (8 occurrences). They render as `Ãƒâ€šÃ‚Â·`. This is outside Phase 1F's scope and was left unchanged.
- **Hydration warning (existing issue).** A theme-class hydration mismatch on `<html>` in `app/layout.tsx` shows in development. It is not related to this phase.
- **Report scope:** reports are operational management views. They are not audited statements and do no currency conversion; any conversion needs an approved policy first.
- **No in-browser preview for Office files:** .docx and .xlsx always download as attachments.

## 9. Production rollout requirements
1. Review `0013_document_management.sql`, then back up or branch the production database before applying it.
2. Run these pre-flight checks on production. Each must return no rows:
   - `SELECT organization_id, supersedes_document_id FROM documents WHERE supersedes_document_id IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1`. Any rows would make the new unique index fail.
   - `SELECT kind FROM documents WHERE kind NOT IN (…new list…)`, and confirm every `document_links` row has exactly one parent.
3. Apply 0013 in a maintenance window through the normal migration process. It is additive and short; triggers are created at the end.
4. **Clerk:** the production instance needs no new roles. The new permissions come from existing roles in code.
5. **Storage:** confirm the production S3-compatible bucket variables (`SALES_STORAGE_*`) are set, the bucket is private, and there is no public access.
6. **Staging smoke test:**
   - upload, revise, open (PDF in a clean browser), archive;
   - a non-admin denial;
   - one CSV export opened in Excel or Sheets.
7. Roll out navigation and pages together with the migration. The pages assume the 0013 columns exist.

## 10. Rollback precautions
- **Application:** redeploy the previous build. The new tables and columns are unused by older code, and the commercial artifact upsert is compatible both ways.
- **Database:** do not drop the 0013 columns or functions while documents uploaded under 0013 exist. Version families, archive reasons and staff, milestone and company links would be lost. If a rollback is unavoidable, export `documents`, `document_links` and the `document.*` audit rows first.
- **Triggers:** if the immutability triggers ever block an urgent fix, disable them for that one transaction rather than dropping them, and re-enable them in the same transaction.
- **`division_enabled`:** do not revert it to the 0012 body. That body disables every division when an empty divisions list is saved.
- **Stored files:** never delete them during rollback. Their keys are content-addressed and are referenced by the immutable audit trail.
