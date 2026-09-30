"use client";

/** Card + footer used by every settings tab: title/description, fields, sticky-ish save row with pending state. */
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FieldErrors, Result } from "@/lib/result";

export function useSettingsSubmit() {
  const router = useRouter();
  const t = useTranslations("settings");
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const submit = (fn: () => Promise<Result<unknown>>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.message);
        return;
      }
      setErrors({});
      toast.success(t("saved"));
      after?.();
      router.refresh();
    });
  return { pending, errors, submit, setErrors };
}

export function SettingsSection({
  title,
  description,
  children,
  footer,
  testId,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
}) {
  return (
    <Card className="gap-0 py-0" data-testid={testId}>
      <CardHeader className="border-b border-border px-4 py-3 lg:px-6">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-4 px-4 py-4 lg:px-6">{children}</CardContent>
      {footer && (
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3 lg:px-6">
          {footer}
        </div>
      )}
    </Card>
  );
}

export function SaveButton({
  pending,
  label,
  testId,
}: {
  pending: boolean;
  label?: string;
  testId?: string;
}) {
  const tc = useTranslations("common");
  return (
    <Button
      type="submit"
      disabled={pending}
      className="min-h-11 gap-2"
      data-testid={testId ?? "settings-save"}
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {label ?? tc("save")}
    </Button>
  );
}
