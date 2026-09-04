"use client";

import { useRef } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

/** Stable function reference whose body always sees the latest closure (alternative to useCallback). */
export function usePersistFn<T extends AnyFn>(fn: T): T {
  const fnRef = useRef<T>(fn);
  fnRef.current = fn;
  const persistFn = useRef<T | null>(null);
  if (!persistFn.current) {
    persistFn.current = function (this: unknown, ...args: Parameters<T>) {
      return fnRef.current.apply(this, args);
    } as T;
  }
  return persistFn.current;
}
