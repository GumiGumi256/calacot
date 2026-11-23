# Sharing invoices and receipts

Staff with invoice issue and read permissions can create an invoice link from an issued invoice. Staff with payment verification and read permissions can create receipt links from confirmed payments. Select **Create secure link**, then copy it or open WhatsApp with the link in a message. Creating a link does not send a message. Links created in these controls expire after seven days. **Revoke all links** immediately disables existing links for that document, including existing invoice delivery links.

The WhatsApp customer-care invoice flow uses the document page and its existing 30-day delivery-link lifetime. Quotations keep their existing delivery behavior. The page offers a preview and PDF download. Receipt PDFs are snapshots: their refund total is as of link creation, and they confirm the original amount received. An invoice page becomes unavailable if the invoice is no longer issued. Links are bearer credentials: anyone who receives one can use it until expiry or revocation, so staff should send them only to the intended client.

Set `CALACOT_APP_URL` to the canonical HTTPS origin in production. The existing `document_shares` table and private sales PDF storage are used. Apply `drizzle-current/0020_whatsapp_receipt_notifications.sql` through the normal reviewed migration process to queue WhatsApp receipts when payments are allocated; it does not backfill or send historical payments. The application stores only hashes of newly generated tokens. Shared pages are excluded from search indexing, set no-referrer and no-store headers, and are filtered from Sentry events; infrastructure access logs should also redact `/shared/` and `/api/sales/shared/` paths. Local PDF storage is for capture-mode development only; production requires the existing private object-storage configuration.

## Automated WhatsApp templates

Both templates need Meta approval as utility templates, using the same language as `WHATSAPP_TEMPLATE_LANGUAGE`. Each has one dynamic URL button at index 0. The approved button URL must be `https://www.calacot.com/shared/{{1}}` when `CALACOT_APP_URL=https://www.calacot.com`; replace the origin in the template if the configured canonical origin differs. The app supplies only the unique token as the URL suffix. Give Meta a non-sensitive example token consisting of 64 hexadecimal characters. An actual link must not be used as the approval example.

Invoice template, suggested name `calacot_invoice_ready`:

> Hello {{1}}, your agreement for project {{2}} and quotation {{3}} has been confirmed. Invoice {{4}} is ready. You can view and download it using the button below.

Meta body examples in order: `Jane Doe`, `Kampala Residence`, `CAL-Q-2026-000001`, `CAL-I-2026-000001`. Button text: `View invoice`.

Receipt template, suggested name `calacot_payment_receipt`:

> Hello {{1}}, we have verified your payment. Receipt {{2}} is available for invoice {{3}}; the amount applied is {{4}}. You can view and download your receipt using the button below.

Body examples in order: `Jane Doe`, `CAL-R-2026-000001`, `CAL-I-2026-000001`, `UGX 500000`. Button text: `View receipt`. The receipt confirms the full original payment; the message amount is the portion applied to this invoice. One message is queued per allocation.

After approval configure `WHATSAPP_PROJECT_CONFIRMATION_TEMPLATE`, `WHATSAPP_PROJECT_TEMPLATE_APPROVED=true`, `WHATSAPP_PROJECT_LINK_BUTTON_APPROVED=true`, `WHATSAPP_RECEIPT_TEMPLATE`, and `WHATSAPP_RECEIPT_TEMPLATE_APPROVED=true`. Configure `SALES_SHARE_SECRET` (at least 32 characters), the canonical origin, storage and existing WhatsApp provider settings. Both messages continue to require documented consent and pass the existing opt-out and delivery controls. They are not sent without the corresponding approved template configuration. Automated links expire 30 days after the delivery intent was created; an expired queued intent is blocked instead of sending an unusable link. This applies to new and existing unsent invoice intents when the updated worker runs.

Run `npm run test:shared-documents` for local database-backed checks of access, expiry, document status, tenant isolation, and revocation. This does not replace deployment verification against the configured database and object storage.
