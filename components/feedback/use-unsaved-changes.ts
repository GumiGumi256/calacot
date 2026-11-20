"use client";

import { useEffect } from "react";

/**
 * Warns before work is lost (docs C9 "unsaved changes"). While `dirty` is true:
 *  - reloading or closing the tab shows the browser's own leave-page prompt;
 *  - clicking an in-app link asks for confirmation first (capture phase, so it runs before
 *    Next.js client navigation).
 * Browser back/forward is not intercepted: the App Router exposes no blocking API for it.
 */
export function useUnsavedChangesGuard(dirty: boolean, message = "You have unsaved changes. Leave this page without saving?") {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}
