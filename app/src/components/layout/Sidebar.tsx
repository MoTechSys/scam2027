"use client";

import { ChevronsLeft, ChevronsRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toPhysicalSide, useDirection } from "@/hooks/useDirection";
import { cn } from "@/lib/utils";
import { BrandMark } from "./BrandMark";
import { NAV_ICONS } from "./nav-icons";
import type { LayoutTenant, NavLink } from "./types";

type Props = {
  items: NavLink[];
  tenant: LayoutTenant;
  collapsed: boolean;
  onToggle: () => void;
};

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop sidebar (lg+). Collapsed state shows icons with tooltips. */
export function Sidebar({ items, tenant, collapsed, onToggle }: Props) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const dir = useDirection();
  const Collapse = dir === "rtl" ? ChevronsRight : ChevronsLeft;
  const Expand = dir === "rtl" ? ChevronsLeft : ChevronsRight;

  return (
    <aside
      className={cn(
        "fixed inset-y-0 start-0 z-40 hidden flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
        collapsed ? "w-20" : "w-72",
      )}
      aria-label={t("menu")}
    >
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        <BrandMark tenant={tenant} />
        {!collapsed && (
          <span className="truncate text-base font-bold" title={tenant.name}>
            {tenant.name}
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label={t("menu")}>
        <ul className="space-y-1">
          {items.map((item) => {
            const Icon = NAV_ICONS[item.key];
            const active = isActivePath(pathname, item.href);
            const link = (
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "sidebar-item text-sm font-medium text-sidebar-foreground/80",
                  active && "active font-semibold",
                  collapsed && "justify-center px-0",
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                {!collapsed && <span className="truncate">{t(item.key)}</span>}
                {collapsed && <span className="sr-only">{t(item.key)}</span>}
              </Link>
            );
            return (
              <li key={item.key}>
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side={toPhysicalSide("end", dir)}>{t(item.key)}</TooltipContent>
                  </Tooltip>
                ) : (
                  link
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="sidebar-item w-full justify-center text-sm text-sidebar-foreground/70"
        >
          {collapsed ? <Expand className="size-5" aria-hidden="true" /> : <Collapse className="size-5" aria-hidden="true" />}
          <span className={cn(collapsed && "sr-only")}>{collapsed ? t("expand") : t("collapse")}</span>
        </button>
      </div>
    </aside>
  );
}
