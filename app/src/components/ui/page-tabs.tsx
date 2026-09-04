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
    <div className="sticky top-[64px] z-30 bg-background/95 backdrop-blur-sm border-b border-border -mx-4 lg:-mx-6 px-4 lg:px-6 py-2 mb-6">
      <nav className="flex gap-1 overflow-x-auto pb-px -mb-px scrollbar-hide">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "tab-item flex items-center gap-2 whitespace-nowrap",
                isActive && "active"
              )}
            >
              {Icon && <Icon className="h-4 w-4" />}
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className={cn(
                  "px-2 py-0.5 text-xs rounded-full",
                  isActive 
                    ? "bg-primary/20 text-primary" 
                    : "bg-muted text-muted-foreground"
                )}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
