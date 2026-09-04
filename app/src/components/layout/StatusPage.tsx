import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared full-page status screen (404 / 401 / tenant states / errors). Server-safe; no client state.
 */
export function StatusPage({
  icon: Icon,
  code,
  title,
  body,
  action,
  children,
}: {
  icon: LucideIcon;
  code?: string;
  title: string;
  body: string;
  action?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10 neon-glow-sm">
          <Icon className="size-8 text-primary" aria-hidden="true" />
        </div>
        {code && <p className="mb-2 font-mono text-sm text-muted-foreground">{code}</p>}
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="mt-3 text-muted-foreground">{body}</p>
        {children}
        {action && (
          <Link href={action.href} className={cn(buttonVariants({ variant: "default", size: "lg" }), "mt-8 min-h-11")}>
            {action.label}
          </Link>
        )}
      </div>
    </main>
  );
}
