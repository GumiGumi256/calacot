CREATE TABLE IF NOT EXISTS care_conversations (
 phone text PRIMARY KEY, mode text NOT NULL DEFAULT 'bot' CONSTRAINT care_mode_check CHECK (mode IN ('bot','human','closed')),
 clerk_user_id text, linked_until timestamptz, business_unit text, assigned_to text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS care_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL UNIQUE REFERENCES whatsapp_messages(id) ON DELETE CASCADE,
 phone text NOT NULL REFERENCES care_conversations(phone), state text NOT NULL DEFAULT 'queued' CONSTRAINT care_job_state_check CHECK (state IN ('queued','processing','done','dead')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_token uuid,
 error_code text, decision jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS care_jobs_ready_idx ON care_jobs(state,available_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS care_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid UNIQUE REFERENCES care_jobs(id) ON DELETE SET NULL,
 phone text NOT NULL REFERENCES care_conversations(phone), kind text NOT NULL CONSTRAINT care_request_kind_check CHECK (kind IN ('lead','callback','handoff')),
 business_unit text, fields jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'new' CONSTRAINT care_request_status_check CHECK (status IN ('new','contacted','closed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS care_requests_status_idx ON care_requests(status,created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS care_link_tokens (
 hash text PRIMARY KEY, phone text NOT NULL REFERENCES care_conversations(phone), expires_at timestamptz NOT NULL, used_at timestamptz
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS care_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor text NOT NULL, phone text, action text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
