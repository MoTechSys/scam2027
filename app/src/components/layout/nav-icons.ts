import type { LucideIcon } from "lucide-react";
import { NAV_ITEMS, type NavKey } from "@/lib/nav/items";

export const NAV_ICONS: Record<NavKey, LucideIcon> = Object.fromEntries(
  NAV_ITEMS.map((i) => [i.key, i.icon]),
) as Record<NavKey, LucideIcon>;
