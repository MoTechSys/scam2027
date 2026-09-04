"use client";

/**
 * MobileDataTable — renders a column model as compact list rows on small screens.
 * Row click is a real <button>; actions live in a dropdown; pagination reuses TablePagination.
 */
import type * as React from "react";
import { MoreVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cellValue, TablePagination, type Column, type Pagination } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface MobileColumn<T> extends Column<T> {
  primary?: boolean;
  secondary?: boolean;
  badge?: boolean;
  icon?: boolean;
  action?: boolean;
  hide?: boolean;
}

export interface MobileAction<T> {
  label: string;
  icon?: React.ReactNode;
  onClick: (item: T) => void;
  variant?: "default" | "destructive";
}

interface MobileDataTableProps<T> {
  columns: MobileColumn<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
  emptyMessage: string;
  actionsLabel?: string;
  actions?: MobileAction<T>[];
  onItemClick?: (item: T) => void;
  pagination?: Pagination;
}

export function MobileDataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage,
  actionsLabel = "إجراءات",
  actions,
  onItemClick,
  pagination,
}: MobileDataTableProps<T>) {
  const primaryCol = columns.find((c) => c.primary);
  const secondaryCol = columns.find((c) => c.secondary);
  const badgeCols = columns.filter((c) => c.badge);
  const iconCol = columns.find((c) => c.icon);
  const visibleCols = columns.filter(
    (c) => !c.hide && !c.primary && !c.secondary && !c.badge && !c.icon && !c.action,
  );

  if (data.length === 0)
    return <div className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</div>;

  return (
    <div className="space-y-2">
      <ul className="overflow-hidden rounded-lg border border-border bg-card/50">
        {data.map((item, index) => {
          const body = (
            <>
              {iconCol && <div className="item-icon bg-primary/10">{cellValue(item, iconCol)}</div>}
              <div className="item-content text-start">
                {primaryCol && <div className="item-title">{cellValue(item, primaryCol)}</div>}
                {secondaryCol && <div className="item-subtitle">{cellValue(item, secondaryCol)}</div>}
                {visibleCols.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {visibleCols.slice(0, 2).map((col) => (
                      <span key={col.key} className="text-[10px] text-muted-foreground">
                        {cellValue(item, col)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {badgeCols.length > 0 && (
                <div className="flex flex-col gap-1">
                  {badgeCols.map((col) => (
                    <div key={col.key} className="mobile-badge">
                      {col.render ? (
                        col.render(item)
                      ) : (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          {cellValue(item, col)}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          );
          return (
            <li
              key={keyExtractor(item)}
              className={cn("flex items-center", index !== data.length - 1 && "border-b border-border")}
            >
              {onItemClick ? (
                <button
                  type="button"
                  onClick={() => onItemClick(item)}
                  className="mobile-list-item min-h-11 flex-1 active:bg-muted/50"
                >
                  {body}
                </button>
              ) : (
                <div className="mobile-list-item min-h-11 flex-1">{body}</div>
              )}
              {actions && actions.length > 0 && (
                <div className="item-actions">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-11" aria-label={actionsLabel}>
                        <MoreVertical className="size-4" aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {actions.map((action) => (
                        <DropdownMenuItem
                          key={action.label}
                          onClick={() => action.onClick(item)}
                          className={cn(action.variant === "destructive" && "text-destructive")}
                        >
                          {action.icon}
                          {action.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {pagination && pagination.totalPages > 1 && <TablePagination {...pagination} />}
    </div>
  );
}

export function ScrollableTable({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mobile-table-wrapper lg:mx-0", className)}>{children}</div>;
}
