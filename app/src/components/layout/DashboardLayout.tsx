"use client";

import { useCallback, useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { BottomNavigation } from "./BottomNavigation";
import { Header } from "./Header";
import { MobileDrawer } from "./MobileDrawer";
import { Sidebar } from "./Sidebar";
import type { LayoutTenant, LayoutUser, NavLink } from "./types";

const COLLAPSE_KEY = "scam.sidebar.collapsed";

type Props = { items: NavLink[]; user: LayoutUser; tenant: LayoutTenant; children: React.ReactNode };

/**
 * App shell: desktop sidebar (lg+) + sticky header; mobile header + drawer + bottom bar.
 * Layout uses logical properties only (RTL/LTR follow <html dir>).
 */
export function DashboardLayout({ items, user, tenant, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore persisted UI preference on mount
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-dvh bg-background">
        <Sidebar items={items} tenant={tenant} collapsed={collapsed} onToggle={toggle} />
        <MobileDrawer open={drawerOpen} onOpenChange={setDrawerOpen} items={items} tenant={tenant} user={user} />

        <div className={cn("flex min-h-dvh flex-col transition-[padding] duration-200", collapsed ? "lg:ps-20" : "lg:ps-72")}>
          <Header user={user} tenant={tenant} onOpenMenu={() => setDrawerOpen(true)} />
          <main id="main" className="flex-1 px-4 py-6 pb-bottom-nav sm:px-6 lg:pb-8" tabIndex={-1}>
            {children}
          </main>
        </div>

        <BottomNavigation items={items} onMore={() => setDrawerOpen(true)} />
      </div>
    </TooltipProvider>
  );
}
