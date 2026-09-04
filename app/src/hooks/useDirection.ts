"use client";

import * as React from "react";

export type Dir = "rtl" | "ltr";

/**
 * Current document direction. Radix `side`/`align` props are physical, so components that must
 * open on the logical "end" side use `toPhysicalSide()` with this hook.
 */
export function useDirection(): Dir {
  const [dir, setDir] = React.useState<Dir>("rtl");
  React.useEffect(() => {
    const el = document.documentElement;
    const read = () => setDir(el.getAttribute("dir") === "ltr" ? "ltr" : "rtl");
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["dir"] });
    return () => mo.disconnect();
  }, []);
  return dir;
}

export function toPhysicalSide(side: "start" | "end", dir: Dir): "left" | "right" {
  return (side === "start") === (dir === "ltr") ? "left" : "right";
}
