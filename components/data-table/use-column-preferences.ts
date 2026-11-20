"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@clerk/nextjs";
import type { DataColumn } from "./types";
import { preferenceKey, resolveHidden } from "./preferences";

/*
 * Column visibility preferences, persisted per user, organization and table (docs C7, F3).
 * V1 stores them in this browser's localStorage under
 *   calacot.table.<tableId>.v1.<orgId>.<userId>
 * so preferences never leak between accounts on a shared device. When storage is unavailable
 * (private mode, blocked site data) they fall back to memory for the session; defaults always work.
 */

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

// Keys starting with "session:" (no signed-in user yet) live in memory only and are never saved.
const sessionOnly = (key: string) => key.startsWith("session:");

function readRaw(key: string) {
  if (sessionOnly(key)) return memory.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}
function writeRaw(key: string, value: string | null) {
  if (sessionOnly(key)) {
    if (value === null) memory.delete(key);
    else memory.set(key, value);
    listeners.forEach((listener) => listener());
    return;
  }
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    if (value === null) memory.delete(key);
    else memory.set(key, value);
  }
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useColumnPreferences<T>(tableId: string, columns: DataColumn<T>[]) {
  const { userId, orgId } = useAuth();
  const persistent = Boolean(userId);
  const key = userId ? preferenceKey(tableId, orgId, userId) : `session:${tableId}`;
  const raw = useSyncExternalStore(subscribe, () => readRaw(key), () => null);
  const hidden = useMemo(() => resolveHidden(raw, columns), [raw, columns]);
  const isCustomised = raw !== null;

  const setHidden = useCallback(
    (next: string[]) => {
      writeRaw(key, JSON.stringify({ hidden: next }));
    },
    [key],
  );
  const toggle = useCallback(
    (id: string, visible: boolean) => setHidden(visible ? hidden.filter((h) => h !== id) : [...new Set([...hidden, id])]),
    [hidden, setHidden],
  );
  const reset = useCallback(() => {
    writeRaw(key, null);
  }, [key]);

  return { hidden, toggle, reset, isCustomised, persistent };
}
