/**
 * Fallback for public pages that depend on the visitor (sign-in state, query parameters). Under
 * Cache Components these render at request time inside a Suspense boundary; this is shown briefly.
 */
export function PublicLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <main className="site-container flex min-h-[60svh] items-center justify-center pt-28 pb-(--section-space)" aria-busy="true">
      <p role="status" className="type-eyebrow text-brand-black-600 dark:text-brand-black-300">{label}</p>
    </main>
  );
}
