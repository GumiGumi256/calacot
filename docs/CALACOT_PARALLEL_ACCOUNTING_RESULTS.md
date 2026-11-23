# Calacot parallel accounting results

**Status:**

- **Synthetic parallel run: completed, 0 differences.**
- **Parallel run on Calacot's own records: NOT PERFORMED.** No authorized, sanitized copy of Calacot's records and no independently prepared accounts were available, so certification is blocked on this item.

**Audience:** the accountant and management.

## 1. What was run

`scripts/verify-accounting-parallel.mts` (part of `npm run test:migration`) runs one complete representative financial year, entirely synthetic:

| Item | Detail |
|---|---|
| Activity | Share capital; bank loan; sales across five divisions and five revenue accounts; materials; salaries; rent accrued monthly and paid the following month; a computer purchase and monthly depreciation; prepaid insurance expensed monthly; bank charges; petty-cash floats and spending; interest received; loan interest; a dividend; an income-tax provision |
| Volume | 258 journals and 516 lines, posted through the **real** workflow (save, submit, approve by a second person, post). Every month was closed through the controlled close, then a year-end with approved annual statements. |
| Comparison | Every figure the system produced was compared against an **independent reference model** in TypeScript (integer cents, no SQL, no shared code with the database functions) computed from the raw journal list the test generated |

## 2. Results

| Report | Compared | Differences |
|---|---|---|
| Trial balance | Movement and closing for every account, 12 months and the year; totals agree | 0 |
| General ledger | Line count (516), total debits, total credits | 0 |
| Profit and loss | Revenue, cost of sales, gross profit, operating expenses, operating profit, profit before tax and net profit, for 12 months and the year | 0 |
| Division results | Net result of each of the five divisions | 0 |
| Balance sheet | Total assets, total liabilities, equity accounts, unclosed results, at each month end; equation holds | 0 |
| Cash flow | Opening and closing cash, operating, investing, financing, internal transfers, 12 months and the year | 0 |
| Receivables / payables type balances | Accrued expenses (2120), prepayments (1240), petty cash (1110), loan (2510) | 0 |
| Fixed assets | Cost (1540), accumulated depreciation (1590) | 0 |
| Tax liabilities | Income tax payable (2195) | 0 |
| Retained earnings | Year-end transfer = net profit (123,546,794.24); retained earnings after closing; income and expense balances zero | 0 |
| Carry-forward | Every next-year opening balance | 0 |

The figures for the synthetic year are:

- net profit 123,546,794.24;
- total assets 282,995,420.34;
- closing cash 274,662,086.97;
- retained earnings after closing 123,546,794.24.

**Difference classification:** none required. Any difference would fail the run and be listed with system value, reference value and classification. No adjustment is ever made to force agreement.

## 3. Closing and year-end verification in the same run

All of the following were verified:

- All 258 journals are accounted for in the ledger.
- Twelve controlled closes completed, with evidence. The December tax check stood only as an approved exception, because a fixture provision was used.
- Annual statements were approved with no problems.
- Exactly one closing journal exists, and retained earnings are correct.
- The income statement is unchanged by closing.
- Opening balances carry forward exactly.
- **Superseded statements:** an approved January statement set was marked stale ("ledger changed since") after a later correction posted into January. A re-approval superseded it, and the earlier set remains in history.

Separately, the Phase 2E suites verify that unreconciled balances are visible, material exceptions block approval, closed-period changes require `close_reopen` with a reason, and reopening preserves history.

## 4. Defect found by this run

The first run showed report time growing with every month: 7 s, then 23 s, then 47 s for a few hundred lines. The cause was `fs_account_balances`, which evaluated a per-line PL/pgSQL lookup inside a per-account join (quadratic).

It was rewritten as set-based: closing journals are resolved once, lines are aggregated per account, then joined. The Phase 2E suites were re-run and pass. Per-range comparison now takes about 1 s in the in-process test database.

## 5. What a real parallel run needs (to complete)

1. Choose one representative month after the cutoff.
2. Take an authorized, sanitized copy of that month's source records (invoices, payments, expenses, bank statements) and load it onto a database branch, never production.
3. Run Phase 2B in shadow or isolated-test mode to produce the ledger, then close the month.
4. The accountant prepares the same month independently.
5. Compare: trial balance, general ledger, P&L, balance sheet, cash flow, receivables, payables, cash and bank, tax, fixed assets, retained earnings.
6. Classify every difference:
   - timing;
   - classification or mapping;
   - missing source event;
   - policy difference;
   - error in the system;
   - error in the independent accounts.
7. Resolve every material difference before certification.

| Report | Calacot | Independent | Difference | Classification | Resolution |
|---|---|---|---|---|---|
| *(to complete)* | | | | | |
