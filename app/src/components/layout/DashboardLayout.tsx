"use client";

import { useCallback, useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { BottomNavigation } from "./BottomNavigation";
import { Header } from "./Header";
import { MobileDrawer } from "./MobileDrawer";
import { PageHeaderProvider } from "./page-header";
import { Sidebar } from "./Sidebar";
import type { LayoutTenant, LayoutUser, NavLink } from "./types";

const COLLAPSE_KEY = "scam.sidebar.collapsed";

type Props = { items: NavLink[]; user: LayoutUser; tenant: LayoutTenant; children: React.ReactNode };

/**
 * App shell (ADR-0007 + ADR-0008): one fixed viewport (`h-dvh`) — app bar → <main> (flex column, never scrolls) →
 * bottom bar. Pages put their lists inside `ScrollRegion`s (via `PageShell`) so only the list moves.
 * Desktop: sidebar (lg+) + 64px header. Mobile: 56px app bar with ☰ (drawer) + page title; 4-item bottom bar.
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
      <PageHeaderProvider>
        <div className="h-dvh overflow-hidden bg-background">
          <Sidebar items={items} tenant={tenant} collapsed={collapsed} onToggle={toggle} />
          <MobileDrawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            items={items}
            tenant={tenant}
            user={user}
          />

          <div
            className={cn(
              "flex h-dvh flex-col transition-[padding] duration-200",
              collapsed ? "lg:ps-20" : "lg:ps-72",
            )}
          >
            <Header user={user} tenant={tenant} onOpenMenu={() => setDrawerOpen(true)} />
            <main
              id="main"
              className="flex min-h-0 flex-1 flex-col px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-6"
              tabIndex={-1}
            >
              {children}
            </main>
            {/* In-flow (not fixed): the flex column reserves its height, so nothing is ever hidden under it. */}
            <BottomNavigation items={items} />
          </div>
        </div>
      </PageHeaderProvider>
    </TooltipProvider>
  );
}
