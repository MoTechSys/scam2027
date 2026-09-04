"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { BrandMark } from "./BrandMark";
import { NAV_ICONS } from "./nav-icons";
import { isActivePath } from "./Sidebar";
import type { LayoutTenant, LayoutUser, NavLink } from "./types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NavLink[];
  tenant: LayoutTenant;
  user: LayoutUser;
};

export function MobileDrawer({ open, onOpenChange, items, tenant, user }: Props) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="start" className="w-80 max-w-[85vw] p-0">
        <SheetHeader className="flex-row items-center gap-3 border-b border-border p-4 text-start">
          <BrandMark tenant={tenant} />
          <div className="min-w-0">
            <SheetTitle className="truncate text-base">{tenant.name}</SheetTitle>
            <SheetDescription className="truncate text-xs">{user.name}</SheetDescription>
          </div>
        </SheetHeader>
        <nav className="overflow-y-auto p-3" aria-label={t("menu")}>
          <ul className="space-y-1">
            {items.map((item) => {
              const Icon = NAV_ICONS[item.key];
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    onClick={() => onOpenChange(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn("sidebar-item text-sm font-medium", active && "active font-semibold")}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                    <span>{t(item.key)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
