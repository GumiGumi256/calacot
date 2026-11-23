# Calacot fixed asset policy (system controls)

**Status:** controls implemented in Phase 2D; nothing is active in production. **Decision needed** marks policy the accountant and management must set. **[enforced]** marks rules enforced by the database.
**Audience:** the accountant, finance staff who manage assets, approvers, and asset custodians.

## FA-1 Category policies

Each asset category is a versioned accounting policy, proposed by one person and approved by another with `depreciation_approve`. It records the following **[enforced]**:

- useful life (months), residual value (fraction of cost), method (straight-line only for now), and partial-period convention;
- capitalization threshold;
- accounts: cost (asset), accumulated depreciation (contra asset), depreciation expense, impairment expense, gain on disposal (other income), loss on disposal (expense);
- optionally, the capital-allowance rule code used for **tax only**.

The system invents no useful life, residual value or rate. Nothing can be capitalized under an unapproved category. **[enforced]** **Decision needed:** the categories (for example computers, furniture, vehicles, tools), their lives, residual values, thresholds and conventions.

## FA-2 Register

1. Every asset has a sequential number (FA-00001), name, ownership, acquisition and capitalization dates, cost and currency, supplier, source document, division, project, custodian, location and serial number. **[enforced]**
2. **Company-owned vs hired:** hired equipment is registered for custody only. It is never capitalized, depreciated or disposed through the ledger. **[enforced]**
3. **No duplication:** an asset bought through an approved expense is linked to that expense. The total cost of assets linked to one expense can never exceed its net amount. Supplier invoices and disbursements are not re-entered. **[enforced]**
4. Assets below the category threshold cannot be capitalized. **[enforced]**
5. Financial details lock once capitalization is prepared. Custody, location, division and project change only through recorded transfers. **[enforced]**

## FA-3 Capitalization

A capitalization journal is prepared and then approved and posted by a different person. **[enforced]**

| Source | Journal |
|---|---|
| Reclassified from an expense | Dr asset cost, Cr the expense account the purchase was charged to |
| Direct (owed or paid through another account) | Dr asset cost, Cr the payable or clearing account |
| Opening balance at cut-over | Dr asset cost, Cr accumulated depreciation (opening), Cr 3900 opening balance equity (net) |

**Decision needed:** cut-over date and the opening asset register (cost and accumulated depreciation per asset, from evidence).

## FA-4 Depreciation

1. Straight-line: (cost − residual value) ÷ useful life per month, capped so the carrying amount never falls below residual value. **[enforced]**
2. Partial periods follow the approved convention: *by days in service*, *full month from capitalization*, or *from the month after capitalization*. **[enforced]** In the disposal month, depreciation runs to the disposal date by days.
3. Depreciation is run per accounting period after the period ends. One run may be pending at a time. A period is never depreciated twice, and a run catches up any months not yet depreciated. **[enforced]**
4. Each run is one journal (Dr depreciation expense by division and project, Cr accumulated depreciation), approved and posted by a different person. **[enforced]**
5. Fully depreciated assets remain in the register at residual value until disposed.
6. The calculation is implemented twice (SQL and an exact TypeScript model) and cross-checked by tests.

## FA-5 Impairment and write-down

Recorded with a reason and evidence, limited to the carrying amount above residual value, dated no earlier than the last depreciated date, and approved by a different person (Dr impairment expense, Cr accumulated depreciation). **[enforced]** **Decision needed:** impairment review policy and indicators.

## FA-6 Disposal

1. Requires evidence and an explanation. Depreciation already posted beyond the disposal date must be reversed first, and the months before the disposal month must be depreciated first. **[enforced]**
2. The system computes the final partial depreciation, carrying amount and gain or loss. Journal: Cr cost, Dr accumulated depreciation, Dr depreciation expense (final part), Dr proceeds (company account or receivable), Cr gain or Dr loss. **[enforced]**
3. Approved and posted by a different person. A disposal can be reversed (for example a cancelled sale), which returns the asset to service. **[enforced]**

## FA-7 Accounting depreciation is not tax

Accounting depreciation (ledger) and tax capital allowances (income-tax computation only) are separate **[enforced]**:

- Capital allowances are computed per asset from **approved capital-allowance rules** (class, method: straight-line or reducing balance, rate), using the tax written-down value after allowances in approved computations of earlier years.
- They are imported into a draft income-tax computation as a deduction, together with an add-back of the year's accounting depreciation and impairment from the ledger.
- They never create journals.

Assets without an approved rule are listed and excluded. **Decision needed:** the capital-allowance classes and rates, confirmed by the tax adviser.

## FA-8 Reversals and historical adjustments

Posted journals are never edited. Reversal is allowed only when nothing later depends on the journal: a capitalization cannot be reversed while depreciation, impairment or disposal exists, and a depreciation run cannot be reversed while a later run or a disposal uses its assets. Reverse the latest entries first. **[enforced]**

## FA-9 Authority

`assets_manage` (Administrators, Finance) prepares; `depreciation_approve` (Administrators, delegable) approves policies and every asset journal. Nobody approves their own work. **[enforced]**
