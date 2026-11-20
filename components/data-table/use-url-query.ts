"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type QueryChanges = Record<string, string | number | boolean | null | undefined>;

/**
 * URL-bound list state. The server parses the same parameters (lib/sales/contracts parseQuery),
 * so the URL stays the single source of truth: shareable, back-button safe and bookmark compatible.
 * Unknown parameters are preserved. Any change other than `page` returns to page 1.
 */
export function useUrlQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const hrefWith = useCallback(
    (changes: QueryChanges) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === undefined || value === "") next.delete(key);
        else next.set(key, String(value));
      }
      if (!("page" in changes)) next.delete("page");
      const query = next.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [params, pathname],
  );

  const set = useCallback(
    (changes: QueryChanges) => start(() => router.push(hrefWith(changes), { scroll: false })),
    [router, hrefWith],
  );

  return { params, set, hrefWith, pending };
}
