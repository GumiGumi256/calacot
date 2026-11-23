# Staff notifications

The admin bell shows recent WhatsApp messages, new leads, confirmed payments and delivery failures, scoped to the staff member's current access. Read status is stored per organization and user. Push messages contain only a generic activity notice; opening the app rechecks access. Devices receive events created after they subscribed. The feed retains seven days of activity and shows at most 30 recent entries.

## Setup

1. Apply `drizzle-current/0025_staff_notifications.sql` using the normal reviewed migration process before deploying the application.
2. Generate a VAPID key pair with `npx web-push generate-vapid-keys`. Store the public key as `NEXT_PUBLIC_WEB_PUSH_KEY`, the private key as `WEB_PUSH_PRIVATE_KEY`, and a contact such as `mailto:admin@example.com` as `WEB_PUSH_SUBJECT`. Keep the private key secret and stable across deployments.
3. Set a random `NOTIFICATION_WORKER_SECRET` of at least 32 characters in the application and as a secret on `deployment/notification-scheduler`; deploy the scheduler after the application. It invokes the protected worker once per minute. Verify the cron and server logs after deployment.
4. Staff opt in using the bell on each browser/device. A supported secure origin is required; on iOS, Web Push requires an installed Home Screen web app.

An unavailable push provider is retried on the next run; expired subscriptions are removed. A recovered lease can result in a repeated generic notification if a provider accepted a request just before a worker stopped. Push is not a substitute for the in-app feed. Revoked or suspended staff are excluded on the next worker run. Do not send private record content in push payloads.
