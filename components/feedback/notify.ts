"use client";

import { toast } from "@/components/ui/toast";

/**
 * Design System V1 toast helper (Base UI toast manager mounted in app/layout.tsx).
 * Use for significant async outcomes only (saved, sent, generated, approved). Call it after
 * the server has confirmed the result, never optimistically. Errors stay until dismissed.
 */
export const notify = {
  success(title: string, description?: string) {
    return toast.add({ title, description, type: "success", timeout: 5000 });
  },
  info(title: string, description?: string) {
    return toast.add({ title, description, type: "info", timeout: 5000 });
  },
  error(title: string, options: { description?: string; retry?: () => void } = {}) {
    return toast.add({
      title,
      description: options.description,
      type: "error",
      timeout: 0,
      priority: "high",
      actionProps: options.retry ? { children: "Retry", onClick: options.retry } : undefined,
    });
  },
  /** Shows a loading toast that resolves to success or error with the promise. */
  promise<T>(promise: Promise<T>, messages: { loading: string; success: string; error: string }) {
    return toast.promise(promise, {
      loading: { title: messages.loading, type: "loading" },
      success: { title: messages.success, type: "success" },
      error: { title: messages.error, type: "error", timeout: 0 },
    });
  },
};
