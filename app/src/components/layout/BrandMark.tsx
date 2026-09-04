import Image from "next/image";
import type { LayoutTenant } from "./types";

/** Tenant logo or a neon initial. Decorative — the tenant name is rendered as text next to it. */
export function BrandMark({ tenant, size = 40 }: { tenant: LayoutTenant; size?: number }) {
  if (tenant.logoUrl) {
    return (
      <Image
        src={tenant.logoUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-xl object-contain"
        unoptimized
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-black text-primary-foreground neon-glow-sm"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {tenant.name.trim().charAt(0) || "S"}
    </div>
  );
}
