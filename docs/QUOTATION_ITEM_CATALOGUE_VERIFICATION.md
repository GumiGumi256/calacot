# Quotation item catalogue: verification

**Scope.** An organization-scoped catalogue of items and default selling prices, integrated into the quotation builder. It starts with the Painting division but is designed for all divisions.

**Status.** Implemented and verified on isolated development resources only. **Nothing has been deployed.** None of the following were touched:
- production data or migrations;
- production Clerk configuration;
- customer communications (the browser test ran in `capture` notification mode against a `+clerk_test` address).

## 1. Features implemented

### Item catalogue (`/admin/catalogue`, "Item catalogue" in the Sales navigation)

Each item has:
- name, division, category, type (material, labour or service), description and unit of measurement;
- a default selling price and currency;
- an active/inactive status and created/updated timestamps;
- an automatic code such as `CAT-PAI-00001`;
- a full audit history.

Prices are decimal strings stored as `numeric(17,2)` and are validated twice: in the application and again in the database. JavaScript floating point is never used as the authority.

The catalogue page has:
- search (name, description, category or code; wildcards are treated literally);
- filters for division (Painting by default), type, category, currency and status (active, inactive or all);
- pagination.

Users with management permission get **New item**, **Edit** and **Deactivate/Reactivate**. Deactivation keeps all history; inactive items simply cannot be newly selected.

### Quotation builder

The existing quotation editor's line section is replaced by an editor with these parts:
- **Add from catalogue.** A searchable list of *active* items in the quotation's division and currency. One click adds a line, filled in with the item's name, description, unit and price.
- **Quantity and live totals.** Quantities allow up to 4 decimals. Line subtotal, tax and total are recalculated live with the same decimal-safe `totals()` the server uses, and the server recalculates independently.
- **Line management.** Any number of lines (up to the existing limit of 100), with **Move up**, **Move down** and **Remove line**.
- **Custom lines.** "Add custom line" adds a line with an optional name and type plus a free description, unit and price, without leaving the editor.
- **Save to catalogue.** Shown only to authorized staff. It opens the catalogue form, prefilled from the custom line and locked to the quotation's division and currency, inside the editor. On save, the line becomes a catalogue line in place and the draft is kept.
- **Line badges:**
  - *Catalogue price*;
  - **Price override**, with the hint "Catalogue price X. This override is recorded." and a **Use catalogue price** button;
  - *Custom line*.
- **Catalogue-line restrictions.** A catalogue line's item and unit are read-only. Its unit price is read-only unless the user may override prices.

### Price and historical integrity

- Every line stores a **snapshot**: `item_name`, `item_type`, `catalogue_unit_price` (the catalogue price used as reference) and `price_source` (`catalogue`, `override` or `custom`), alongside the existing description, unit, quantity and price.
- **The database decides the price source** inside `sales_quote_save`, under a row lock on the item. The browser never decides it.
- Issued quotation snapshots include `name`, `itemType` and `priceSource` per line, and the PDF shows the item name above the description.
- **Catalogue price changes never alter issued quotations.** Line rows and snapshots are immutable after issue, enforced by the existing triggers.
- **Revisions** copy the snapshot fields. A revision that keeps an earlier catalogue price counts as a *catalogue* price, not an override. Updating to the current catalogue price is also allowed without override permission.
- Version conflicts, approval or confirmation, payment schedules, tax and invoice creation are unchanged: the `sales_quote_command` body is byte-identical apart from two asserted patches.
- **Older quotations** keep working. Pre-catalogue lines have null snapshot fields and are valid under every constraint. Re-saving such a draft stores its lines as `custom`.

## 2. Files changed

**New**
- `drizzle-current/0014_quotation_item_catalogue.sql` and `drizzle-current/meta/0014_snapshot.json`
- `lib/catalogue/contracts.ts`: schema, types and labels
- `lib/catalogue/reads.ts`: list, filters and picker
- `lib/catalogue/actions.ts`: save and picker search
- `components/catalogue/catalogue-forms.tsx`: create/edit dialog and status button
- `components/sales/quote-lines.tsx`: catalogue-aware line editor
- `app/(admin)/admin/catalogue/page.tsx`, with `loading.tsx` and `error.tsx`
- `scripts/verify-quotation-catalogue.mjs`
- `scripts/verify-catalogue-concurrency-postgres.mjs`

**Modified**
- `database/schema/services.ts`: the existing `services` table becomes the catalogue (no competing table)
- `database/schema/commercial-core.ts`: `quotation_items` snapshot columns and checks
- `lib/sales/contracts.ts`: optional `catalogueItemId`, `name` and `itemType` per line
- `lib/sales/actions.ts`: passes the server-side override permission, plus new messages
- `lib/sales/permissions.ts`: `catalogue_read`, `catalogue_manage` and `quotation_price_override`
- `lib/sales/document-model.ts`: optional snapshot fields
- `lib/sales/pdf.tsx`: item name on PDF lines
- `components/sales/quote-form.tsx`: uses the new line editor; the default division is now Painting
- `app/(admin)/admin/quotations/new/page.tsx` and `[id]/page.tsx`: capabilities and stored reference prices
- `lib/finance/context.ts`: catalogue messages
- `lib/admin/navigation.ts` and `components/app-sidebar.tsx`: navigation entry

**Generated helpers (test only, under `tmp/`):** `gen-0014-functions.mjs`, `clock-skew-preload.mjs`, `pdf-text.mjs`, `ticket.mjs`, `dev-role.mjs`, `fx-query.mjs`.

## 3. Migration: `0014_quotation_item_catalogue.sql` (additive, reviewed)

It depends on the existing `drizzle-current/` chain 0000–0013.

**`services` table** (the existing catalogue table, previously unused by the app):
- New nullable columns `category`, `item_type`, `created_by_clerk_user_id` and `updated_by_clerk_user_id`, plus `row_version integer NOT NULL DEFAULT 1`.
- New checks `services_item_type_check` and `services_row_version_check`.
- A new partial unique index `services_active_item_uq` on (organization, division, currency, lower(name), unit) among **active** items.

**`quotation_items` table:**
- New nullable columns `item_name`, `item_type`, `catalogue_unit_price` and `price_source`.
- A new check `quotation_items_price_source_check`, which ties each source to its references:

  | Price source | Catalogue item | Reference price |
  |---|---|---|
  | `custom` | none | none |
  | `catalogue` | required | equals the line's unit price |
  | `override` | required | differs from the line's unit price |

- A new check `quotation_items_item_type_check`.

**Sequence:** `catalogue_item_code_seq`.

**Functions:**
- **`catalogue_item_save` (new):**
  - validates every field again in the database;
  - does optimistic concurrency on `row_version`;
  - is organization-scoped;
  - audits `catalogue.create`, `update`, `price_change`, `deactivate` and `reactivate` with before/after values and the source (`catalogue` or `quotation`).
- **`sales_quote_save` (replaced):** the 0001 logic plus server-side line resolution:
  - the item must belong to the organization and be a typed, priced catalogue item;
  - the item must match the quotation's division and currency;
  - the unit cannot be changed;
  - an inactive item is refused unless the draft already used it;
  - the price source is resolved here;
  - an override requires permission;
  - overrides are recorded in the `quotation.save` audit entry (`priceOverrides`).
- **`sales_quote_command` (replaced):** the 0001 body with exactly two patches, both asserted by the generator: the snapshot includes the new line fields, and revisions copy them.

**Verified:**
- The chain 0000–0014 applies from empty in one transaction on PostgreSQL 17.5 (local) and 18.7 (Neon).
- The Neon acceptance fixture was upgraded in place from 0013.
- A copy of production (a Neon `development` branch) has **0 `services` rows**, 2 legacy quotation lines and no duplicate groups, so the new index and checks apply cleanly to existing data.

## 4. Authorization decisions

| Capability | Permission | Default grant | Enforcement |
|---|---|---|---|
| View and search the catalogue; select items in quotations | `catalogue_read` | admin, sales, finance, project manager, viewer | `staffContext` (session org must match the configured Clerk organization) |
| Add custom quotation lines | existing `quotations_create` / `quotations_edit` | admin, sales | existing quotation mutation |
| Create, edit, deactivate items; Save to catalogue | `catalogue_manage` (**sensitive**) | **admin only**; delegable per user with the Clerk custom permission `org:calacot:catalogue_manage` | `financeMutation`: live Clerk membership and role check on every mutation, same-origin, rate limit, staff mirror, DB row lock and version |
| Override a catalogue price | `quotation_price_override` (**sensitive**) | **admin only**; delegable with `org:calacot:quotation_price_override` | the permission is decided by the server (never from the browser) and enforced inside `sales_quote_save` |

**Other controls:**
- **Cross-organization access.** It is blocked twice:
  1. This deployment refuses sessions from other Clerk organizations.
  2. Every catalogue read and write, and every quotation line resolution, is scoped by organization in SQL. Another organization's item id is reported as unavailable.
- **Logged changes:** catalogue creation, edits, price changes, deactivation and reactivation, and every quotation price override.
- **Policy decision needed (see section 7):** custom lines and line discounts are not governed by the override permission.

## 5. Tests

All suites below passed on 2026-11-19.

| Suite | Result |
|---|---|
| `verify-quotation-catalogue.mjs` (PGlite, real actions, reads, permissions, SQL; fake Clerk) | **PASS, 10 groups.** See the group list after this table. |
| `verify-catalogue-concurrency-postgres.mjs`, two overlapping connections | **PASS, 6 cases, on PostgreSQL 17.5 (local) and 18.7 (Neon).** See the case list after this table. |
| `verify-sales-postgres.ts` (existing sales lifecycle on the new functions, Neon fixture) | **PASS:** concurrent confirmations issue one invoice, three intents and no payment; finalized lines cannot change. The Neon server clock runs about 2.8 s behind this machine, so the run used a test-only clock-offset preload (−2950 ms); with a larger offset it is correctly refused. |
| `npm run test:sales` (calculations, revision conflicts, immutable snapshots, ledger balances, PDF and email fixtures) | PASS. It runs on the legacy `drizzle/` history, so the 0014 functions are covered by the two suites above. |
| `verify-finance-concurrency-postgres` 8, `verify-admin-concurrency-postgres` 5, `verify-documents-concurrency-postgres` 6, all on chain 0000–0014 | PASS |
| `verify-finance-documents`, `verify-finance-expenses` (17), `verify-documents-reports` (7), `verify-staff-admin` (18), `verify-phase1e-history`, `verify-staff-reconciliation`, `verify-clerk-webhook-signature` | PASS |
| `verify-phase1e-static` | PASS: 17 API routes clear of the tenant proxy pattern; all submit buttons typed |
| TypeScript (`tsc --noEmit`) | Clean (only stale backups under `tmp/` report errors) |
| ESLint on all changed and new files | 0 errors, 0 warnings |
| Production build (isolated copy) | Exit 0, 54/54 pages including `/admin/catalogue` |

**`verify-quotation-catalogue.mjs` groups (10):**
1. Creating and editing items: decimal prices, audit trail, row version, and validation in both the application and the database.
2. Concurrent edits: a stale row version is refused, not silently overwritten.
3. Search and filters: text, division default, type, category, status, literal wildcards, and the picker's division and currency scoping.
4. Selecting items: quantities, decimal-safe line totals (rounding is checked), custom lines, reordering and removal.
5. Overrides:
   - sales is refused, including when the browser forges an `allowPriceOverride` flag;
   - a changed unit is refused;
   - an admin override is stored and audited;
   - a direct database write is blocked.
6. Inactive items: they can't be newly selected, but an existing draft keeps them.
7. Historical integrity:
   - the issued snapshot carries name and source;
   - a later catalogue price change leaves issued lines and snapshot untouched, and the immutability trigger holds;
   - the PDF renders;
   - a revision isn't flagged as an override;
   - after confirmation, the invoice totals and line prices equal the quotation's.
8. Legacy lines without catalogue fields keep working, and their PDF still renders.
9. Unauthorized access is denied for sales, viewer and unapproved employee, and a Clerk custom permission delegates management.
10. Cross-organization access is denied at both layers.

**`verify-catalogue-concurrency-postgres.mjs` cases (6):**
1. The migration chain applies.
2. Two administrators edit the same version: the second waits, then gets a conflict.
3. A quotation is saved while the price changes: the price change waits, and the quotation keeps its snapshot.
4. A price change commits first: a quotation still using the old price waits, then is refused for lack of override permission.
5. Deactivation races a new selection: the selection is refused.
6. The same new item is created twice at once: only one active item results.

## 6. Browser acceptance (development Clerk instance, isolated Neon fixture)

**Setup:**
- Local dev server on the isolated build copy, using the existing test organization and test users.
- Sign-in used one-time development tokens, so no passwords were typed.
- The fixture was upgraded to 0014.
- Painting was enabled through the real **Company settings** page (settings version 4).
- One planned painting project and a contact were seeded.

| Check | Result |
|---|---|
| Admin creates an item through **New item** | Pass. Listed with code, category, type, unit, price, status and who updated it; `catalogue.create` audited. |
| Catalogue picker in the quotation editor | Pass. Lists only active painting items priced in UGX; search "sand" returns only Surface preparation. |
| Item selection and quantities | Pass. Name, description, unit and price are filled in. Totals for 42.5 × 1500.50 and 42.5 × 8500 are exact, and the custom line with a discount is correct. |
| Admin price override | Pass. Badged **Price override** with the catalogue price shown; stored as `override` (8000 against 8500); audited in `priceOverrides`. |
| Reordering and removal | Pass |
| Save to catalogue from a custom line | Pass. The dialog is prefilled, division and currency are locked, and the line converts in place without leaving the editor; audited with `source: quotation`. |
| Reload of the draft | Pass. Badges and reference prices are restored. |
| Issue (Send) | Pass. The snapshot holds names, sources and prices. The final PDF (35 KB) contains the item names, descriptions, the overridden price and the total. The email intent was only queued, with no worker and capture mode. |
| Catalogue price edit after issue | Pass. 8500 → 9000 audited as `catalogue.price_change`; the issued line, snapshot and total are unchanged. |
| Sales role (test user temporarily `org:sales`, then reverted) | Pass, see the breakdown below this table. |
| Same user back as unapproved `org:member` | Pass. Redirected to Access pending. |
| Mobile (375 px) | Pass. No horizontal overflow on the catalogue page or the quotation editor. |

**Sales-role breakdown:**
- The catalogue is read-only: no New item, Edit or Deactivate controls.
- The editor picks up the new 9000.00 price automatically.
- The price field is read-only with an explanation, and there is no Save to catalogue.
- A tampered price (5000) is refused by the server with a clear message.
- "Use catalogue price" followed by Save succeeds.

**Environment notes (not product defects):**
- A browser extension in the test Chrome profile intercepts PDF responses (shown as 204 in the page). The server log shows 200, and the stored PDF was checked directly.
- The isolated dev copy initially lacked the PDF font file under its own `node_modules`, which produced a 503. Copying that one font file into the test copy fixed it. Production builds resolve the font normally.

**Cleanup after acceptance:**
- The test user's role was reverted and the mirror resynced.
- Test sessions were signed out and none remain; the tab is closed.
- The dev server and local PostgreSQL are stopped.
- The fixture keeps its test catalogue items and test quotations.

## 7. Limitations and decisions needed
1. **Override policy gaps.** Two paths can still change the effective price without the override permission:
   - *Custom lines* may carry any price, as the specification requires. Someone could add a custom line instead of the catalogue item. Custom lines are always badged and stored as `custom`, so they are reviewable, but they are not blocked.
   - *Line discounts* use the existing discount field and are not treated as price overrides.

   If either should require approval, a policy decision is needed (for example, custom lines need `quotation_price_override`, or a discount cap).
2. **Catalogue tax rate unused.** The existing `services.default_tax_rate` column is ignored. Quotations still use the single approved tax rate (`CALACOT_APPROVED_TAX_RATE`), as before.
3. **Invoice line names.** Invoice line rows (`invoice_items`) don't store the item name or source. The invoice document snapshot and PDF include them because they're copied from the quotation snapshot.
4. **No catalogue data in production.** No bulk import and no seeded painting price list; prices must be entered (or imported) by an authorized person.
5. **Global code sequence.** Item codes come from one sequence shared by all organizations, so numbers are unique but not consecutive per organization.
6. **Faint read-only styling.** Read-only catalogue fields are only lightly shaded in dark mode; the hint text explains they are set by the catalogue.

## 8. Production rollout requirements
1. **Production is behind.** The production database currently has migrations **0000–0004** only. 0014 depends on 0005–0013, so the whole sequence must be reviewed and rolled out in order, starting with the Phase 1D–1F rollout steps. 0014 alone cannot be applied.
2. **Back up first.** Take a Neon snapshot or branch of production before migrating. A `development` branch copy already shows that 0005–0014 apply cleanly to current production data.
3. **Pre-flight checks:**
   - `SELECT count(*) FROM services` (expected 0);
   - the duplicate check on (organization, division, currency, lower(name), unit) among active items (expected none).
4. **Clerk.** No new roles are required. To delegate catalogue management or price overrides to non-admins, create the custom permissions `org:calacot:catalogue_manage` and `org:calacot:quotation_price_override` in the **production** Clerk instance and assign them deliberately.
5. **Company settings.** Painting must be enabled in production company settings before painting quotations can be saved.
6. **Initial price list.** An authorized person should enter or approve it, and confirm the policy decisions in section 7.
7. **Staging smoke test, mirroring section 6:**
   - create an item;
   - build a quotation with catalogue, custom and override lines;
   - issue it and open the PDF in a clean browser;
   - change a price and confirm the issued quotation is unchanged;
   - check that sales is denied overrides and catalogue management.

**Rollback.** Redeploying the previous application build is safe: the new columns are nullable and unused by older code. However, the replaced `sales_quote_save` and `sales_quote_command` stay in place, and the old 0001 bodies would ignore the new columns. If the database functions must be rolled back, restore the 0001 definitions and keep the columns; do not drop them while catalogue-era lines exist.

**Production-ready?** Database, integration and browser verification are complete and passing. The enhancement is **ready for staging rollout**. It is **not production-ready** until:
- migrations 0005–0013 are rolled out to production first;
- the policy decisions in section 7 are confirmed;
- the staging smoke test passes.
