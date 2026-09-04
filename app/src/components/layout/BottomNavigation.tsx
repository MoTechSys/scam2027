"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { NAV_ICONS } from "./nav-icons";
import { isActivePath } from "./Sidebar";
import type { NavLink } from "./types";

type Props = { items: NavLink[]; onMore: () => void };

/** Mobile bottom bar (< lg): up to 4 primary destinations + "more" opening the drawer. */
export function BottomNavigation({ items, onMore }: Props) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const primary = items.filter((i) => i.bottom).slice(0, 4);
  const hasMore = items.length > primary.length;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur safe-area-bottom lg:hidden"
      aria-label={t("menu")}
    >
      <ul className="flex items-stretch justify-around">
        {primary.map((item) => {
          const Icon = NAV_ICONS[item.key];
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.key} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium text-muted-foreground",
                  active && "text-primary",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                <span className="truncate">{t(item.key)}</span>
              </Link>
            </li>
          );
        })}
        {hasMore && (
          <li className="flex-1">
            <button
              type="button"
              onClick={onMore}
              className="flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium text-muted-foreground"
            >
              <MoreHorizontal className="size-5" aria-hidden="true" />
              <span>{t("more")}</span>
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}
