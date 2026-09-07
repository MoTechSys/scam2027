/**
 * PageShell — standard list-page skeleton (ADR-0008 §3):
 *   [PageHeader on lg] → [tabs] → [toolbar: search/filters/primary action] → ScrollRegion{list} → [pagination]
 * Everything except the list is fixed; the list scrolls inside the remaining height. Pages pass their pieces as
 * slots so the shell owns the flex geometry and the pages own the content.
 */
import { cn } from "@/lib/utils";
import { ScrollRegion } from "@/components/ui/scroll-region";

type Props = {
  header?: React.ReactNode;
  tabs?: React.ReactNode;
  toolbar?: React.ReactNode;
  /** Small line under the toolbar (counts, storage bar …). */
  meta?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  listLabel?: string;
  className?: string;
  /** Max content width on desktop. */
  width?: "5xl" | "7xl";
};

export function PageShell({
  header,
  tabs,
  toolbar,
  meta,
  children,
  footer,
  listLabel,
  className,
  width = "7xl",
}: Props) {
  return (
    <div
      className={cn(
        "mx-auto flex h-full min-h-0 w-full flex-col gap-2 lg:gap-4",
        width === "7xl" ? "max-w-7xl" : "max-w-5xl",
        className,
      )}
      data-testid="page-shell"
    >
      {header}
      {tabs}
      {toolbar && <div className="shrink-0">{toolbar}</div>}
      {meta && <div className="shrink-0">{meta}</div>}
      <ScrollRegion label={listLabel} className="-mx-1 px-1">
        {children}
      </ScrollRegion>
      {footer && <div className="shrink-0 border-t border-border pt-2">{footer}</div>}
    </div>
  );
}
