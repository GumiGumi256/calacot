CREATE TABLE IF NOT EXISTS staff_notification_reads (
  organization_id text NOT NULL,
  clerk_user_id text NOT NULL,
  event_id text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, clerk_user_id, event_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS staff_notification_reads_age_idx ON staff_notification_reads (read_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS staff_push_subscriptions (
  endpoint text PRIMARY KEY,
  organization_id text NOT NULL,
  clerk_user_id text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS staff_push_subscriptions_user_idx ON staff_push_subscriptions (organization_id, clerk_user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS staff_push_deliveries (
  endpoint text NOT NULL REFERENCES staff_push_subscriptions(endpoint) ON DELETE CASCADE,
  event_id text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  PRIMARY KEY (endpoint, event_id)
);
