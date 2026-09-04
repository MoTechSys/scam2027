"use client";

import { useMediaQuery } from "./use-media-query";

export const MOBILE_BREAKPOINT = 768;

/** True below the `md` breakpoint (768px). SSR renders desktop first, then hydrates. */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
}
