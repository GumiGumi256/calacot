# Calacot document verification

## Status

**Feature complete for quotations and invoices; not yet deployed.** Migration `drizzle-current/0017_document_verification.sql` is journaled but has not been applied to any database. All verification behaviour is behind flags that default to off. With the flags off, the existing commercial PDF workflow is unchanged.

Two kinds of issuance exist:

- **Embedded.** New quotation and invoice PDFs carry their own verification reference, a QR code on the first page, and a verification link in the footer of every page. The SHA-256 is taken from the final bytes, so it covers the QR.
- **Legacy.** Existing PDFs made before embedding was enabled can be registered by an authorized staff member. The original file is never modified, so the recipient receives the reference separately.

Receipts, contracts and project completion documents are not covered (see "Out of scope").

## How issuance works

`finalArtifact` (in `lib/sales/artifacts.ts`) is the only place commercial PDFs are produced. The download route, the sales worker and customer care all call it. It now works like this:

1. **Reuse.** If a document row already exists for the record (the v1 key, or a v2 embedded key), it is returned unchanged. Existing artifacts are never regenerated or overwritten.
2. **v1 recovery.** If an unembedded v1 object was stored but never registered (an interrupted earlier run), it is registered as before.
3. **Embedded issuance** happens only when `CALACOT_VERIFICATION_ENABLED=true` and `CALACOT_VERIFICATION_EMBED=true`, and the record has issuance authority (below). The steps are:
   - Derive the reference: `HMAC(CALACOT_VERIFICATION_REFERENCE_SECRET, "embedded/v1", org, entity, record id)`. Only its SHA-256 digest is stored.
   - Render the PDF with the QR and link, then write it to `commercial/<org>/<entity>/<id>/calacot-commercial-v2-<digest prefix>.pdf` with a **create-only** write.
   - Read the object back from storage and hash **those** bytes.
   - Call `verification_finalize_embedded`. In one transaction it writes the document row, the link, the issuance, its first `issued` event and the `verification.issue_embedded` audit entry.
4. Otherwise the v1 behaviour is unchanged: no QR and no record.

**Issuance authority.** The PDF itself is not authority. Authority comes from the staff action that issued the business record, which is already authorized, audited and tenant-scoped:

- **Quotations:** a sent (or later) version with an immutable snapshot whose number matches the quotation, plus a `quotation.send` audit entry for that exact version.
- **Invoices:** an issued (or later voided) invoice with an immutable snapshot whose number matches, plus an `invoice.issue` audit entry.

`verification_embedded_candidate` encodes these rules, and `registered_by` records the auditing actor. A record without that evidence gets an ordinary v1 PDF. Embedded issuance does not repeat a Clerk check at render time, because the issuing action already passed one. Rendering is often triggered later by the worker or by a download, where no staff session exists.

**Crash safety and concurrency:**

- The reference is re-derivable, writes are create-only, and the digest always comes from the stored bytes. A crash between store and finalize therefore leaves only an unregistered private object, which the next call recovers without rewriting it.
- When two writers race, one create-only write wins and both publish the winner's bytes.
- Finalization takes a per-record advisory lock and is idempotent. Different bytes at the same key raise `verification_artifact_conflict`.
- Every response re-hashes the stored object against the recorded digest. Tampered objects raise `artifact_checksum_mismatch`.

**Storage:**

- `storePdf` is create-only for every commercial PDF. Locally it opens with `wx`. On S3 or R2 it sends a signed `If-None-Match: *` PUT, and a 412 or 409 response means "exists".
- The v1 path now also hashes the bytes read back from storage, not the bytes it rendered. This fixes a latent race that could record a digest for an object that another writer had replaced.

**Secret rotation.** Rotating `CALACOT_VERIFICATION_REFERENCE_SECRET` affects only future derivations. Finalized embedded records keep their stored digest, so their printed references continue to verify. The key includes the digest prefix, so after a rotation an interrupted, unfinalized object is ignored rather than mis-registered. Legacy references cannot be re-displayed after a rotation (they are not stored), but they still verify.

## Legacy registration

Legacy registration is started from the document page by staff with the `verification_issue` permission. It requires:

- a fresh Clerk membership check and organization/document access;
- an origin check and a per-staff rate limit;
- the stored bytes to match the recorded SHA-256;
- a v1 commercial artifact, a matching snapshot, the issuance audit entry, and written evidence.

It never accepts an uploaded PDF as evidence. Embedded (v2) artifacts cannot be registered as legacy.

## Status changes

Staff with `verification_revoke` can mark an issued document as revoked, withdrawn, superseded (by another issued document of the same type), expired (quotations only) or voided (invoices only). Every change requires a reason.

Events are append-only and cannot return a document to issued. Database triggers enforce ordering and the transition rules even for callers that bypass the helper functions. Every change is audited.

Independently, the public lookup reports invoice void, quotation supersession, decline and expiry live. Payment status is never treated as a revocation.

The document page shows the current record (kind, status, recorded SHA-256) to anyone who can read the document. The status form is shown only while the document is issued.

## Public verification

`/verify` and `/verify/<reference>` (the QR target) call `POST /api/verify`. The response contains only:

- type, number, issuer and issue date;
- the current status;
- the integrity result: `match`, `mismatch` or `not_checked`.

**Files never leave the visitor's device.** The page hashes the chosen PDF in the browser (Web Crypto, up to 50 MB) and sends only the 64-character digest in `x-verification-sha256`. The API refuses any request body with a 413 response. This removes the earlier 4 MB limit, so every artifact up to the 20 MB storage cap can be checked.

The UI states that a recognized reference alone does not prove a copy is unaltered.

**Controls:**

- Responses are `no-store`. Pages send `no-referrer` and `noindex`.
- The API fails closed unless `CALACOT_VERIFICATION_ENABLED=true`, a trusted client-IP source (`CALACOT_VERIFICATION_TRUST_VERCEL` on Vercel, or `CALACOT_VERIFICATION_TRUST_CLOUDFLARE`), and `CALACOT_VERIFICATION_RATE_SECRET` (at least 32 characters) are all set.
- Rate limits are 30 per minute per HMAC-hashed client IP, and 600 per minute globally.
- **Only set the trust flag when the origin is reachable exclusively through a Cloudflare edge that overwrites this header.** The global limit can be exhausted by an attacker, so add edge or WAF rate limits for `/api/verify`.
- References are bearer credentials. Redact `/verify/*` URLs from access logs and monitoring.

## Configuration

| Variable | Purpose |
| --- | --- |
| `CALACOT_VERIFICATION_ENABLED` | Master switch for the public API, the admin panel and registration. |
| `CALACOT_VERIFICATION_EMBED` | Embed references and QR codes in newly issued PDFs. Requires the master switch. |
| `CALACOT_VERIFICATION_REFERENCE_SECRET` | At least 32 characters. Derives references. Store it in a secrets manager and keep it for the lifetime of issued documents. |
| `CALACOT_VERIFICATION_RATE_SECRET` | At least 32 characters. Hashes client IPs for rate limiting. |
| `CALACOT_VERIFICATION_TRUST_VERCEL` | Use Vercel's edge-set `x-real-ip` for rate limiting. Takes effect only when `VERCEL=1` (the production setup). |
| `CALACOT_VERIFICATION_TRUST_CLOUDFLARE` | Use `cf-connecting-ip`. Set only behind a Cloudflare-only origin; never on the current Vercel-served site. |
| `CALACOT_VERIFICATION_ORIGIN` | Canonical public origin printed into PDFs (falls back to `CALACOT_APP_URL`). Must be HTTPS with no path. `http://localhost` is allowed only in capture mode. |

With embedding enabled, a missing secret or a non-HTTPS origin makes issuance fail with `verification_configuration`. It does not fall back to issuing unverifiable PDFs.

## Files

- `drizzle-current/0017_document_verification.sql`: tables, immutability and transition triggers, audit trigger, legacy registration, status changes, `verification_embedded_candidate` and `verification_finalize_embedded`. `database/document-verification-draft.sql` is superseded and can be deleted.
- `lib/documents/verification-config.ts`: flags, the canonical origin, and embedded and legacy reference derivation.
- `lib/documents/verification-crypto.ts`: reference canonicalization and digest, and constant-time digest comparison.
- `lib/sales/artifacts.ts`, `lib/sales/storage.ts`, `lib/sales/pdf.tsx`: issuance flow, create-only storage, QR and link stamping.
- `lib/documents/verification-actions.ts`, `components/documents/verification-controls.tsx`, `lib/documents/reads.ts`, the document detail page: admin record view, legacy registration and status changes.
- `app/api/verify/route.ts`, `app/verify/`, `components/documents/public-verification.tsx`, `next.config.ts`: public lookup.

## Tests

Run all of them with `npm run test:verification`. Every test is isolated: PGlite in memory, mocked Clerk and storage, no environment or network access.

- `verify-document-verification-db.mjs`: the full migration chain. Covers legacy registration and retry, immutability, transitions and replacement rules, embedded authority for invoices and for exact quotation versions, tenant isolation, key and digest binding, idempotent finalize, artifact conflict, legacy/embedded separation, and void handling.
- `verify-document-verification-artifacts.mjs`: the real renderer and `finalArtifact`. Covers v1 behaviour with flags off, reuse of existing artifacts, the no-authority fallback, a crash after store followed by recovery with no rewrite, concurrent recovery, two fresh issuances racing, the embedded reference matching the recorded digest, the QR image being present, tamper detection, and failing closed on misconfiguration. Pass `--write` to save `tmp/pdfs/verification-embedded.pdf` for visual review.
- `verify-document-verification-route.mjs`: the route. Covers match and mismatch by digest, 30 MB files checked by digest, uploads refused, invalid digests, void status, unknown and malformed references, rate limiting, and disabled configuration.
- `verify-document-verification-actions.mjs`: legacy action authorization, altered stored bytes and deterministic retry.
- `verify-document-verification-crypto.mjs`: reference format and digests.

## Before enabling in production

1. Apply migration 0017 through the approved deployment process (`npm run db:migrate` against a reviewed branch first). It is additive.
2. Run `npm run test:verification`. Then run `scripts/verify-documents-concurrency-postgres.mjs`-style concurrency checks against an isolated real PostgreSQL. PGlite is single-connection, so the advisory-lock paths are exercised logically but not truly in parallel.
3. Confirm the storage provider honours `If-None-Match: *`. Store a test key twice in a non-production bucket: the second write must return "exists". The existing storage connectivity check already confirms that signed conditional PUTs are accepted.
4. Configure the canonical HTTPS origin, the secrets, the Cloudflare-only origin and the edge rate limits. Then enable `CALACOT_VERIFICATION_ENABLED`, check legacy registration and the public page with a development Clerk account, and only then enable `CALACOT_VERIFICATION_EMBED`.
5. Scan a QR from an issued PDF on a phone and confirm the page reports `issued`, and `match` for the original file.

## Out of scope

- **Receipts.** Receipt numbers exist, but there is no finalized receipt PDF pipeline to bind to.
- **Contracts and project completion documents.** They need their own issuance rules and evidence before they can be supported.
