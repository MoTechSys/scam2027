/**
 * ScrollRegion — the only thing that scrolls (ADR-0008). Fills the remaining height of its flex column
 * (`flex-1 min-h-0`) and scrolls internally with `overscroll-contain`, so the app viewport never moves.
 * Server-renderable.
 */
import { cn } from "@/lib/utils";

type Props = React.ComponentProps<"div"> & {
  /** Accessible name for the region (lists/tables should always have one). */
  label?: string;
};

export function ScrollRegion({ className, label, children, ...props }: Props) {
  return (
    <div
      role={label ? "region" : undefined}
      aria-label={label}
      // WCAG 2.1.1 / axe `scrollable-region-focusable`: a scrollable landmark must be reachable by keyboard.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={label ? 0 : undefined}
      data-testid="scroll-region"
      className={cn(
        "min-h-0 flex-1 scrollbar-thin overflow-y-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
