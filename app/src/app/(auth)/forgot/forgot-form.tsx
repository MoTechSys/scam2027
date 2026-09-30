"use client";

import { MailCheck, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "@/features/auth/actions";
import type { FieldErrors } from "@/lib/result";

export function ForgotForm() {
  const t = useTranslations("auth");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const id = useId();

  if (done)
    return (
      <div className="space-y-4 text-center" data-testid="forgot-done">
        <MailCheck className="mx-auto size-10 text-primary" aria-hidden />
        <p className="text-sm leading-7">{t("forgotDone")}</p>
      </div>
    );

  return (
    <form
      noValidate
      className="space-y-5"
      data-testid="forgot-form"
      onSubmit={(e) => {
        e.preventDefault();
        const identifier = String(new FormData(e.currentTarget).get("identifier") ?? "");
        start(async () => {
          const r = await forgotPasswordAction({ identifier });
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            setMessage(r.message);
            return;
          }
          setDone(true);
        });
      }}
    >
      {message && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor={id}>{t("identifier")}</Label>
        <Input
          id={id}
          name="identifier"
          type="text"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          dir="ltr"
          placeholder={t("identifierPlaceholder")}
          className="min-h-11 text-start"
          aria-invalid={!!errors.identifier || undefined}
        />
        {errors.identifier?.[0] && (
          <p className="text-xs text-destructive" role="alert">
            {errors.identifier[0]}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" className="min-h-11 w-full gap-2 font-semibold" disabled={pending}>
        <Send className="size-4" aria-hidden />
        {pending ? t("submitting") : t("forgotSubmit")}
      </Button>
    </form>
  );
}
