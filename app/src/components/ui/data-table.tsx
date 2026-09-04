"use client";

/**
 * DataTable — sticky-header table with optional pagination (desktop).
 * Typed: `T` is the row type, `render` is required unless the column key holds a primitive.
 */
import type * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type Primitive = string | number | boolean | null | undefined;

export interface Column<T> {
  key: keyof T & string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

export interface Pagination {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  labels?: { prev: string; next: string; page: (current: number, total: number) => string };
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
  emptyMessage: string;
  caption?: string;
  maxHeight?: string;
  pagination?: Pagination;
}

export function cellValue<T>(item: T, column: Column<T>): React.ReactNode {
  if (column.render) return column.render(item);
  const v = item[column.key] as unknown;
  return typeof v === "string" || typeof v === "number" ? v : v == null ? "" : String(v);
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage,
  caption,
  maxHeight = "500px",
  pagination,
}: DataTableProps<T>) {
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="overflow-auto" style={{ maxHeight }}>
          <Table className="table-sticky-header">
            {caption && <caption className="sr-only">{caption}</caption>}
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                {columns.map((column) => (
                  <TableHead
                    key={column.key}
                    scope="col"
                    className={cn("text-start font-semibold", column.className)}
                  >
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                data.map((item) => (
                  <TableRow key={keyExtractor(item)} className="transition-colors hover:bg-muted/20">
                    {columns.map((column) => (
                      <TableCell key={column.key} className={column.className}>
                        {cellValue(item, column)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      {pagination && pagination.totalPages > 1 && <TablePagination {...pagination} />}
    </div>
  );
}

export function TablePagination({ currentPage, totalPages, onPageChange, labels }: Pagination) {
  const l = labels ?? { prev: "السابق", next: "التالي", page: (c: number, t: number) => `صفحة ${c} من ${t}` };
  return (
    <nav aria-label="pagination" className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">{l.page(currentPage, totalPages)}</p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <ChevronRight className="size-4 ltr:hidden rtl:block" aria-hidden />
          <ChevronLeft className="size-4 ltr:block rtl:hidden" aria-hidden />
          {l.prev}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          {l.next}
          <ChevronLeft className="size-4 ltr:hidden rtl:block" aria-hidden />
          <ChevronRight className="size-4 ltr:block rtl:hidden" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
