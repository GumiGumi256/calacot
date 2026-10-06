# Private PDF storage

The Cloudflare R2 bucket `calacot-private-pdfs` was created for finalized commercial PDFs. Its managed public endpoint is disabled and it has no custom domains. Neon remains the single application database; R2 holds document bytes.

The local `.env.local` has the endpoint, bucket and `auto` region configured. Complete these two server-only fields with R2 S3 credentials:

```env
SALES_STORAGE_ACCESS_KEY=<Access Key ID>
SALES_STORAGE_SECRET_KEY=<Secret Access Key>
```

In Cloudflare, open R2 Object Storage → Manage API Tokens → Create Account API Token. Choose Object Read & Write and restrict it to `calacot-private-pdfs`. Copy Access Key ID and Secret Access Key into the local file and the deployment's secret store. The connected Cloudflare integration can manage buckets but cannot manage account API tokens, so credential creation must be completed by the account owner. Do not enable public access or attach a public domain. No browser CORS is needed because the app reads and writes PDFs on the server.

Restart the app after changing secrets. Capture mode continues to use local disk; staging/live uses R2. Test storage independently before running the worker, since the worker may dispatch queued customer messages.

On 6 October 2026, `node scripts/verify-private-storage.mjs` successfully uploaded a non-customer PDF using the application adapter, downloaded identical bytes, and verified that the unsigned S3 read was rejected (HTTP 400). Public R2 access was also verified disabled during setup. Connectivity-test objects remain under `commercial/storage-check/`; no customer notifications were dispatched. This check changes notification mode only inside its own process and never modifies environment files.

Official credential instructions: https://developers.cloudflare.com/r2/api/tokens/
