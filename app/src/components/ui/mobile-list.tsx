"use client";

/**
 * MobileList / MobileCard / MobileSearch / MobileFilters — app-like compact list primitives (≤ md).
 * Clickable rows are real <button>s (keyboard + screen-reader accessible, 44px min target).
 */
import type * as React from "react";
import { ChevronLeft, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface MobileListAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive";
}

export interface MobileListItem {
  id: string | number;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  avatar?: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  actions?: MobileListAction[];
}

interface MobileListProps {
  items: MobileListItem[];
  emptyMessage: string;
  actionsLabel?: string;
  className?: string;
}

export function MobileList({ items, emptyMessage, actionsLabel = "إجراءات", className }: MobileListProps) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }
  return (
    <ul className={cn("divide-y divide-border", className)}>
      {items.map((item) => {
        const body = (
          <>
            {(item.avatar || item.icon) && (
              <div className="shrink-0">
                {item.avatar ?? (
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                    {item.icon}
                  </div>
                )}
              </div>
            )}
            <div className="min-w-0 flex-1 text-start">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{item.title}</p>
                {item.badge}
              </div>
              {item.subtitle && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.subtitle}</p>
              )}
            </div>
            {item.onClick && !item.actions && (
              <ChevronLeft
                className="size-4 shrink-0 text-muted-foreground ltr:rotate-180 rtl:block"
                aria-hidden
              />
            )}
          </>
        );
        return (
          <li key={item.id} className="flex items-center gap-3">
            {item.onClick ? (
              <button
                type="button"
                onClick={item.onClick}
                className="flex min-h-11 flex-1 items-center gap-3 px-1 py-3 transition-colors active:bg-accent/50"
              >
                {body}
              </button>
            ) : (
              <div className="flex min-h-11 flex-1 items-center gap-3 px-1 py-3">{body}</div>
            )}
            {item.actions && item.actions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label={actionsLabel}>
                    <MoreVertical className="size-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {item.actions.map((action) => (
                    <DropdownMenuItem
                      key={action.label}
                      onClick={action.onClick}
                      className={cn(
                        action.variant === "destructive" && "text-destructive focus:text-destructive",
                      )}
                    >
                      {action.icon}
                      {action.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface MobileCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function MobileCard({ children, className, onClick }: MobileCardProps) {
  const cls = cn("rounded-xl border border-border bg-card p-3 text-start", className);
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(cls, "block w-full transition-transform active:scale-[0.98]")}
      >
        {children}
      </button>
    );
  }
  return <div className={cls}>{children}</div>;
}

interface MobileSearchProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
}

export function MobileSearch({ value, onChange, label, placeholder, className }: MobileSearchProps) {
  return (
    <div className={cn("relative", className)}>
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className="h-11 w-full rounded-full border border-border bg-muted/50 px-4 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20 focus:outline-none"
      />
    </div>
  );
}

export interface MobileFilterChip {
  id: string;
  label: string;
  active?: boolean;
}

interface MobileFiltersProps {
  filters: MobileFilterChip[];
  onFilterChange: (id: string) => void;
  className?: string;
}

export function MobileFilters({ filters, onFilterChange, className }: MobileFiltersProps) {
  return (
    <div role="group" className={cn("scrollbar-hide flex gap-2 overflow-x-auto pb-1", className)}>
      {filters.map((filter) => (
        <button
          key={filter.id}
          type="button"
          aria-pressed={!!filter.active}
          onClick={() => onFilterChange(filter.id)}
          className={cn(
            "min-h-11 rounded-full px-3 py-1.5 text-xs whitespace-nowrap transition-all",
            filter.active
              ? "border border-primary/30 bg-primary/10 font-medium text-primary"
              : "border border-transparent bg-muted/50 text-muted-foreground",
          )}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
