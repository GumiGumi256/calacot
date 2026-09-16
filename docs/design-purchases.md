# Architectural design purchases

Checkout now confirms a request before revealing payment details. Sanity remains the catalogue; Neon stores the agreed design/package/price snapshot. Customer pages and PDFs never reconstruct historical purchases from Sanity.

## Database rollout

Apply migrations against the intended database after reviewing the SQL:

```sh
npx drizzle-kit migrate
```

Configuration uses the existing `DATABASE_URL_UNPOOLED` for migrations and `DATABASE_URL` for the app. Migration `drizzle/0004_supreme_martin_li.sql` extends the existing `0003_many_goliath.sql` purchase table; do not replace or rerun already applied migrations manually.

The migration adds unique purchase/invoice references, invoice issue and email delivery timestamps, a review revision, status checks, and a partial unique index allowing only one open purchase per Clerk user/design/package. It retains the existing contact/assignment fields. Old `saved` and `ready_for_payment` purchases become `awaiting_payment`. Legacy references use their full UUID suffix to avoid collisions, and invoice issue dates retain the original creation date.

Existing duplicate open purchases or inconsistent active/completed rows cause migration failure rather than silently deleting or cancelling records. Inspect and reconcile them before migration. New references use 64 random bits, database uniqueness, and bounded collision retries. Inserts use `ON CONFLICT DO NOTHING` and retrieve the winning open purchase on simultaneous submissions.

The migration has been tested against an isolated PostgreSQL engine, including a populated legacy table. It is not automatically applied to the connected Neon database.

## Environment and company configuration

Keep the existing Clerk and Sanity environment configuration. Add real company values to the deployment environment (not source control):

```dotenv
# Existing database and email configuration
DATABASE_URL=
DATABASE_URL_UNPOOLED=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
ENQUIRY_TEAM_EMAIL=

# Optional app origin for invoice/confirmation email links; defaults to https://calacot.com
CALACOT_APP_URL=https://calacot.com

# International WhatsApp business number; include country code
CALACOT_WHATSAPP_NUMBER=

# All three required to display Mobile Money instructions
CALACOT_MOBILE_MONEY_NETWORK=
CALACOT_MOBILE_MONEY_NUMBER=
CALACOT_MOBILE_MONEY_ACCOUNT_NAME=
CALACOT_MOBILE_MONEY_CURRENCY=UGX

# All first three required to display bank instructions; SWIFT is optional
CALACOT_BANK_NAME=
CALACOT_BANK_ACCOUNT_NUMBER=
CALACOT_BANK_ACCOUNT_NAME=
CALACOT_BANK_SWIFT=
CALACOT_BANK_CURRENCY=UGX
```

No placeholder account details are rendered. Missing payment details lead to a contact link. WhatsApp is shown only when its configured international number is valid. Instructions are only shown if their currency matches the purchase. The catalogue currently prices in UGX; the purchase schema also supports USD.

`RESEND_FROM_EMAIL` is an address without a display name and must use the existing project's verified `@contact.calacot.com` sender domain. The shared Resend client preserves this rule for enquiry emails. `ENQUIRY_TEAM_EMAIL` remains required by the existing enquiry flow; purchase emails go to the customer's verified Clerk email.

## Admin setup and authorization

There was no existing admin authorization helper. Set trusted Clerk **public metadata**, using the Clerk dashboard or a trusted backend, for each authorized administrator:

```json
{ "role": "admin" }
```

The centralized server-side `requireAdmin()` checks the current Clerk user through the backend API. It never accepts a browser role or `unsafeMetadata`. Admin access is checked in both pages and mutation actions. Customer reads and writes filter by the authenticated Clerk user, and the invoice endpoint permits only the owner or an authorized admin. Invalid/foreign purchase IDs do not reveal another customer's record.

## Routes

- `/architecture/designs/[slug]/checkout?package=<sanity-id>`: authenticated request confirmation, preserving sign-in return URL.
- `/account/designs`: saved and purchased designs, newest first.
- `/account/designs/[purchaseId]`: snapshot, invoice, payment instructions, assistance and payment-reference submission.
- `/api/design-purchases/[purchaseId]/invoice`: authenticated PDF download with `private, no-store` caching.
- `/admin/design-purchases`: filters, pagination and submitted-payment priority.
- `/admin/design-purchases/[purchaseId]`: customer/payment review, internal notes, email retry and confirm/reject/cancel controls.

The main navigation menu includes **My designs**.

## States and operations

Purchase statuses: `awaiting_payment`, `awaiting_contact`, `payment_submitted`, `completed`, `cancelled`.

Payment statuses: `pending`, `submitted`, `confirmed`, `rejected`.

Access statuses: `pending`, `active`, `revoked`.

Request confirmation creates `awaiting_payment / pending / pending`. Asking Calacot to contact the customer changes the purchase to `awaiting_contact`. Opening WhatsApp does not change payment or access. A payment reference moves the purchase to `payment_submitted / submitted / pending`. Customers cannot replace a reference already under review.

Admins may confirm a submitted payment or an independently verified manual payment on an open purchase. Confirmation atomically sets `completed / confirmed / active`. Rejection returns a submitted payment to `awaiting_payment / rejected / pending` so the customer can correct it. Cancellation closes an open purchase and revokes access. Completed/cancelled records cannot be reviewed again through these controls. Optimistic revision checks reject stale admin forms, including a form opened before a customer changes the payment reference. Each review stores the administrator, date and internal notes.

`canAccessDesign()` centralizes the confirmed-payment plus active-access check. Secure document delivery is intentionally deferred; no private files are exposed. Completed purchases explain that the team will make documents available through the account. Refunds, cancellation of completed purchases, and full review history are not implemented.

## PDF/email reliability

Invoices use `@react-pdf/renderer` on the server, with page wrapping for long included-item lists. PDF regeneration uses only saved purchase data. Email/PDF generation runs through Next.js `after()` after the authoritative database write and cannot roll back the purchase. Resend requests use stable idempotency keys, bounded retries and recorded delivery timestamps. Failures are logged without customer contact details.

Admins can retry undelivered emails from the purchase page. Invoice downloads remain available if an email fails. This uses the existing application's post-response pattern, not a durable queue; deployment termination can interrupt delivery, so inspect delivery timestamps and use retry controls. Resend's idempotency retention is finite; an unusually late retry after an accepted email whose delivery marker could not be written may send a duplicate email, but never creates another purchase.

## Verification

```sh
npx next typegen
npx tsc --noEmit
npm run lint
# If generated Sanity dist files are present, lint application source instead:
npm run lint -- --ignore-pattern 'dist/**' --ignore-pattern 'tmp/**'
npm run build
npx tsx scripts/verify-design-purchases.ts
npx tsx scripts/verify-email.ts
```

Purchase verification uses in-memory PGlite and synthetic customers only. It covers migration backfill, duplicate open purchases, ownership filters, database access constraints, payment rejection/resubmission, stale reviews, terminal states, form validation, preserved invoice content and multipage PDFs. It does not send emails or connect to Neon.

Optional PDF visual verification:

```sh
npx tsx scripts/verify-design-purchases.ts --render
node scripts/render-design-invoice.mjs
```

Samples are written to ignored `tmp/pdfs/`. The testing packages (`@electric-sql/pglite`, `pdfjs-dist`, `@napi-rs/canvas`) are development dependencies.

Before enabling purchases publicly, configure real payment/WhatsApp details and the verified email sender, apply the migration, assign the intended Clerk admin role, and exercise a real authenticated customer/admin flow. No payment gateway or actual design-file delivery is included.

Implementation references: [Clerk role-based authorization](https://clerk.com/docs/guides/secure/basic-rbac), [React PDF server API](https://react-pdf.org/docs/v4/node).

## Changed files

Created:

- `app/account/layout.tsx`, `app/account/designs/page.tsx`, `app/account/designs/[purchaseId]/page.tsx`
- `app/admin/layout.tsx`, `app/admin/design-purchases/page.tsx`, `app/admin/design-purchases/[purchaseId]/page.tsx`
- `app/api/design-purchases/[purchaseId]/invoice/route.ts`
- `components/architecture/purchase-forms.tsx`, `components/architecture/purchase-summary.tsx`
- `lib/design-purchases/{model,permissions,references,transitions,actions,email}.ts`, `lib/design-purchases/invoice.tsx`
- `lib/company.ts`, `lib/email/client.ts`
- `drizzle/0004_supreme_martin_li.sql`, `drizzle/meta/0004_snapshot.json`
- `scripts/verify-design-purchases.ts`, `scripts/render-design-invoice.mjs`, this document

Modified existing working files:

- `components/architecture/design-checkout.tsx`, `components/architecture/design-purchase.tsx`, `components/navbar.tsx`
- `app/(home)/architecture/designs/[slug]/checkout/page.tsx`, `app/(home)/architecture/designs/[slug]/checkout/actions.ts`
- `database/schema.ts`, `lib/queries/design.ts`, `lib/email/queue.ts`
- `drizzle/meta/_journal.json`, `package.json`, `package-lock.json`, `.gitignore`

Pre-existing work in the root layout, sign-in/sign-up, Clerk proxy, and migration `0003` was preserved.
