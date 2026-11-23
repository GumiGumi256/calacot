# Calacot financial reporting policy (system controls)

**Status:** controls implemented in Phase 2E; nothing is active in production. **[enforced]** marks rules the database enforces. **Decision needed** marks policy that the accountant and management must set.
**Audience:** the accountant, management, finance staff who prepare statements, and approvers.

## FR-1 Source of truth

1. Every statement is computed by the database from **posted** journal lines only, in the functional currency. Draft, submitted, approved-but-unposted, rejected and discarded journals never affect a balance. **[enforced]**
2. Dashboards, invoices, payments and other operational records are never used as substitutes for the ledger. **[enforced]**
3. The application never adds, nets or rounds ledger amounts. Line totals, subtotals and the balance-sheet check are all returned by the database. **[enforced]**

## FR-2 Statement classification

1. Each postable account is mapped to one statement line, an optional cash-flow class (operating, investing, financing) and a clearing flag. The mapping is a versioned policy, proposed by one person and approved by another (`fs_approve`). **[enforced]**
2. A line must fit the account type. For example, an expense can never appear on the balance sheet, and accumulated depreciation must be a contra asset. **[enforced]**
3. Cash and bank accounts have no cash-flow class. Every other account that can move cash needs one, or the cash flow is provisional. **[enforced]**
4. One equity account is named as retained earnings. Year-end transfers go to that account. **[enforced]**
5. **Unclassified accounts** still count in totals, so the result is never understated. The statement is marked **provisional** and cannot be approved. **[enforced]**
6. The system offers a starting proposal based on account codes. It is a suggestion only. **Decision needed:** the accountant reviews every line before it is approved.

## FR-3 Statements

| Statement | Basis | Controls |
|---|---|---|
| Income statement | Movements in the period, by line. Income is shown positive and costs negative. | Year-end closing entries are excluded, so closing a year never changes that year's income statement. **[enforced]** |
| Balance sheet | Cumulative balances at a date | Results not yet closed to retained earnings appear as a separate equity line. Assets must equal liabilities plus equity. Any difference is shown and blocks approval, and no balancing figure is ever added. **[enforced]** |
| Cash flow (direct method) | Journals that touch cash accounts. Each cash movement is attributed to the counterpart lines by their **approved class**, never by sign. | Journals that only move money between Calacot's own cash accounts are internal transfers and are excluded. Opening cash plus net movement must equal closing cash. Unclassified movements, or a bank or mobile-money account not reconciled to the period end, make the statement provisional. **[enforced]** |
| Changes in equity | Opening equity, capital, distributions, profit, prior-period corrections, other movements, closing equity | Must reconcile to posted equity movements and unclosed results. Year-end transfers are shown as a movement within equity. **[enforced]** |
| Trial balance | Opening, period debits and credits, and closing balance per account | Debits must equal credits at opening, for the period movement and at closing. **[enforced]** |
| General ledger | Every posted line, with a running balance when one account is selected | Each line links to its journal. **[enforced]** |

Statement rows link to the account ledger for the same dates, and from there to each journal. Approved snapshots are shown without links, because the ledger may have moved since.

## FR-4 Draft and approved statements

1. A **statement set** is computed by the database for a date range (month, quarter, financial year or custom), with an optional comparative range that ends before the current one starts. **[enforced]**
2. Each set stores the following. **[enforced]**
   - The full payload and its SHA-256 hash.
   - A fingerprint of the posted ledger up to the period end.
   - The classification version and accounting-policy version.
   - The functional currency and the generation time.
   - The number of periods still open.
3. Approval (`fs_approve`) must be given by someone other than the preparer, and only if all of the following hold. **[enforced]**
   - Nothing is provisional.
   - The balance sheet balances.
   - The cash flow and equity statements reconcile.
   - The trial balance agrees.
   - There are no foreign-currency lines.
   - The ledger fingerprint and classification version are unchanged.
4. During approval the database locks the relevant periods, so a posting cannot slip in between the check and the commit. A posting already in progress makes the approval wait and then fail as stale. **[enforced]**
5. Approved sets are immutable. A newer approval for the same range supersedes the older one, and both are kept. A set whose ledger has since changed is labelled "ledger changed since". **[enforced]**
6. A set is labelled **final** only when every period it covers is closed. **Decision needed:** whether management statements may be approved before the periods are closed. The system allows it and labels such sets as interim.

## FR-5 Exports

1. CSV exports use the same read and permission as the screen (`fs_read`). They are never cached and are recorded in the audit log. Cells are made formula-safe (cells starting `=`, `+`, `-` or `@` cannot run as formulas). **[enforced]**
2. Live exports are labelled **"DRAFT — NOT APPROVED"**. Snapshot exports carry their status and hash. Every export and printout states "Internal management information, not audited". **[enforced]**
3. Print or PDF output uses the browser's print function on the authenticated page, with navigation and forms hidden. There is no public link to statements. **[enforced]**

## FR-6 Division and project reporting

1. Division results come from the division recorded on each journal line. Lines without a division are **shared** costs. **[enforced]**
2. Shared costs are allocated only under an approved, versioned allocation policy effective for the whole period (fixed shares that total 100%). The allocation is a **memo only** and never posts journals. Without a policy, the report says shared costs are not allocated. **[enforced]**
3. Project results include only lines tagged with a project. **[enforced]**
4. Divisions are not separate legal entities, and nothing is eliminated between them. **Decision needed:** allocation bases (head count, floor space, revenue).

## FR-7 Currency

Statements are in the approved functional currency. The Phase 2A policy cannot enable multi-currency posting (database CHECK constraint), so no translation is performed. Any foreign-currency posting is reported as an exception: it fails a close check and blocks statement approval. **[enforced]** **Decision needed** before any USD activity: an exchange-rate and translation policy, and a presentation currency if it differs from the functional currency.

## FR-8 Revenue and tax

The statements show what is posted. They do not recognise revenue from deposits or unpaid invoices: that depends on the Phase 2B posting rules and approved revenue-recognition policy. Accounting profit is not taxable income: tax is computed separately (Phase 2D). **Decision needed:** a revenue-recognition policy for deposits, contract work and property sales.
