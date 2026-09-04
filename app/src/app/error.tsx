"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");
  useEffect(() => {
    // Client-side breadcrumb only; the server already logged the error with its requestId.
    console.error("[scam2027] route error", error.digest ?? error.message);
  }, [error]);

  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-destructive/10">
          <AlertTriangle className="size-8 text-destructive" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold">{t("genericTitle")}</h1>
        <p className="mt-3 text-muted-foreground">{t("genericBody")}</p>
        {error.digest && <p className="mt-2 font-mono text-xs text-muted-foreground">ref: {error.digest}</p>}
        <Button size="lg" className="mt-8 min-h-11" onClick={reset}>
          {t("retry")}
        </Button>
      </div>
    </main>
  );
}
