# Calacot future tax readiness: VAT, EFRIS and withholding tax

**Status:** structures only. **VAT, EFRIS submission and withholding tax are not active and cannot be activated in this phase.**
**Audience:** the accountant, tax adviser and engineers planning a later phase.

## R-1 What exists and what is blocked

| Capability | Phase 2D state | Control |
|---|---|---|
| VAT obligation | Can be recorded with its registration status and evidence (e.g. *pending verification*) | `processing_enabled` cannot be true for VAT: database CHECK |
| VAT treatment of documents (`vat_document_treatments`) | Table and categories exist: standard-rated, zero-rated, exempt, out of scope; output vs input; input eligibility; rule version | Every write refused (`vat_not_operational`) while VAT is not operational |
| EFRIS records (`efris_documents`) | Fiscal document number, verification code, QR payload, submission status (not submitted → queued → submitted → accepted/rejected), response, attempts | Every write refused while VAT is not operational. No EFRIS client exists and nothing is submitted |
| Withholding tax (`withholding_tax_records`) | Direction (withheld by Calacot from a supplier / withheld from Calacot by a customer), gross, amount, rule, certificate, remittance link | Every write refused (`withholding_tax_not_operational`); WHT cannot be enabled: CHECK |
| VAT and WHT rules | Rule kinds `vat_rate`, `withholding_rate` can be proposed and approved | Approval alone changes nothing; no calculation uses them |
| VAT returns | `tax_filings` can record returns only for an obligation approved as registered | Filings are evidence records, never submissions |

No invoice, credit note, payment or expense is changed by any Phase 2D structure (verified by test). **VAT is never charged because the module exists.** The repository had no existing EFRIS integration to preserve.

## R-2 Design for activation (later phase, separate approval)

1. **Confirm registration** with evidence and approve a VAT obligation version (monthly basis, deadlines).
2. **Reviewed migration** to lift the CHECK for VAT. The readiness guards then allow writes for that organization only.
3. **Treatment at issue:** tax treatment is attached to the immutable issued invoice or credit note snapshot, never recalculated afterwards. It uses the Phase 2B tax-treatment condition (`taxed` mappings to 2180 Output VAT and 1270 Input VAT).
4. **EFRIS:** a queued, idempotent outbox like the sales delivery worker, storing the returned fiscal document number and QR on `efris_documents`. The FDN and verification code would be added to the issued PDF through the Phase 1F document verification pipeline (create-only artifacts, hashed after stamping).
5. **VAT return:** output VAT from issued documents less eligible input VAT from approved expenses, adjustments and credit notes, reconciled to 2180/1270 in the ledger.

## R-3 Withholding tax design

1. **Supplier payments (withheld by Calacot):** on disbursement, the applicable rule (professional services, contractors) would split the payment: Dr payable/expense gross, Cr bank net, Cr 2190 WHT payable. A certificate is issued and remittance recorded as a `tax_payments` row linked through `remitted_payment_id`. Supplier balances reconcile because the gross is settled.
2. **Customer withholding (withheld from Calacot):** today such certificates are claimed only as **income-tax credits** with evidence (Income tax policy IT-3.5). Recording them in the ledger (Dr 1280 WHT receivable, Cr receivable) needs a reviewed change to payment allocation so that customer invoice balances remain correct. Existing invoice balances are not changed.
3. **Never automatic:** no tax is withheld until the obligation, rate and legal basis are verified and approved.

## R-4 Decisions needed

1. Is Calacot VAT-registered (or required to be)? Effective date, certificate.
2. EFRIS onboarding status and integration route (system-to-system or other), credentials ownership.
3. Withholding agent status, applicable payment categories and rates, certificate process.
4. Treatment of customer withholding certificates already received.
