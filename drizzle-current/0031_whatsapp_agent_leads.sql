-- WhatsApp assistant leads (additive).
--
-- The customer-care assistant saves qualified WhatsApp enquiries as leads. A WhatsApp customer is
-- identified by their number and may not share an email, so email becomes optional. `source` tells
-- website forms and WhatsApp apart, and `qualification` keeps the assistant's score, temperature and
-- reasons so staff can prioritise follow-up. Existing rows keep their email and become source 'website'.
ALTER TABLE leads ALTER COLUMN email DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'website';
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN IF NOT EXISTS qualification jsonb;
--> statement-breakpoint
ALTER TABLE leads ADD CONSTRAINT leads_source_check CHECK (source IN ('website', 'whatsapp'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS leads_source_phone_idx ON leads (organization_id, source, phone, created_at);
