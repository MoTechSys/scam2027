"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { NAV_ICONS } from "./nav-icons";
import { isActivePath } from "./Sidebar";
import type { NavLink } from "./types";

type Props = { items: NavLink[] };

/**
 * Mobile bottom bar (< lg) — app-style (ADR-0007 §4, ADR-0008 §5): 64px + safe-area, exactly the permitted
 * `NAV_ITEMS.bottom` destinations (≤ 4). No "more" item — the full menu opens from ☰ in the app bar.
 * The active item gets a rounded `bg-primary/10` pill and neon text.
 */
export function BottomNavigation({ items }: Props) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const primary = items.filter((i) => i.bottom).slice(0, 4);
  if (primary.length === 0) return null;

  const itemClass =
    "flex h-16 w-full flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium text-muted-foreground transition-colors active:bg-accent/40";

  return (
    <nav
      className="safe-area-bottom shrink-0 border-t border-border bg-card/95 backdrop-blur-md lg:hidden"
      aria-label={t("menu")}
      data-testid="bottom-nav"
    >
      <ul className="flex items-stretch justify-around">
        {primary.map((item) => {
          const Icon = NAV_ICONS[item.key];
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.key} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(itemClass, active && "text-primary")}
              >
                <span className={cn("rounded-xl p-1.5 transition-colors", active && "bg-primary/10")}>
                  <Icon className={cn("size-5", active && "neon-text")} aria-hidden="true" />
                </span>
                <span className="w-full truncate text-center">{t(item.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
