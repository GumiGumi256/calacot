-- Run ONLY after a human-reviewed relationship map has reconciled every historical quotation.
-- This script does not invent projects or send notifications.
BEGIN;
LOCK TABLE quotations IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM quotations WHERE project_id IS NULL) THEN
    RAISE EXCEPTION 'Unmatched historical quotations remain; reconcile verified client/project relationships first';
  END IF;
END $$;
ALTER TABLE quotations ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE invoices VALIDATE CONSTRAINT invoices_project_client_fk;
COMMIT;
