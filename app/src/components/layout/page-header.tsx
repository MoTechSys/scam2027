"use client";

/**
 * Page title plumbing (ADR-0007).
 *
 * Every dashboard page renders `<PageHeader title subtitle />` once. On `lg+` it draws the classic in-content header;
 * below `lg` the same title/subtitle are lifted into the sticky app Header (app-like) and the in-content copy is hidden.
 * The provider lives in `DashboardLayout`; `Header` reads the context.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type PageHeaderState = {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  /** True when the in-content <h1> is hidden on mobile, so the app bar must render the title as the page h1. */
  ownsHeading?: boolean;
};

type Ctx = { state: PageHeaderState | null; set: (s: PageHeaderState | null) => void };
const PageHeaderContext = createContext<Ctx | null>(null);

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [state, set] = useState<PageHeaderState | null>(null);
  return <PageHeaderContext.Provider value={{ state, set }}>{children}</PageHeaderContext.Provider>;
}

export function useCurrentPageHeader(): PageHeaderState | null {
  return useContext(PageHeaderContext)?.state ?? null;
}

type Props = PageHeaderState & {
  /** Extra content (actions) rendered at the end of the desktop header row. */
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, badge, actions, className }: Props) {
  const ctx = useContext(PageHeaderContext);
  const set = ctx?.set;
  useEffect(() => {
    if (!set) return;
    set({ title, subtitle, badge, ownsHeading: true });
    return () => set(null);
  }, [set, title, subtitle, badge]);

  return (
    <header
      className={className ?? "hidden lg:flex lg:items-start lg:justify-between lg:gap-4"}
      data-testid="page-header"
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

/**
 * Register only the app-bar title (no in-content markup). For detail pages whose in-content header carries badges
 * and actions that must stay visible on mobile.
 */
export function MobilePageTitle({ title, subtitle }: PageHeaderState) {
  const set = useContext(PageHeaderContext)?.set;
  useEffect(() => {
    if (!set) return;
    set({ title, subtitle, ownsHeading: false });
    return () => set(null);
  }, [set, title, subtitle]);
  return null;
}
