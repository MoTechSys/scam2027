"use client";

/** Dialog wrapper used by feature forms: scrollable, resets field errors on close, optional wide layout. */
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  onReset,
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  onReset?: () => void;
  wide?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onReset?.();
        onOpenChange(o);
      }}
    >
      <DialogContent className={`max-h-[92dvh] overflow-y-auto ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
