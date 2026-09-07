"use client";

/**
 * مكون التبويبات داخل الصفحات
 * S-ACM Frontend - Clean Tech Dashboard Theme
 *
 * - يعرض تبويبات في أعلى الصفحة
 * - يغير المحتوى بدون إعادة تحميل
 * - ثابت (Sticky) يبقى مرئياً عند التمرير
 */

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface Tab {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: number;
}

interface PageTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function PageTabs({ tabs, activeTab, onTabChange }: PageTabsProps) {
  return (
    <div className="-mx-3 shrink-0 border-b border-border px-3 py-1 sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6 lg:py-2">
      <div role="tablist" className="scrollbar-hide -mb-px flex gap-1 overflow-x-auto pb-px">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={(e) => {
                // WAI-ARIA tabs: arrow keys move between tabs (RTL-agnostic: both arrows cycle).
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const i = tabs.findIndex((x) => x.id === tab.id);
                const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
                if (next) onTabChange(next.id);
              }}
              className={cn("tab-item flex items-center gap-2 whitespace-nowrap", isActive && "active")}
            >
              {Icon && <Icon className="h-4 w-4" />}
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs",
                    isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
