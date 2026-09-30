"use client";

/**
 * Shared by /reset and /activate: token (hidden) + new password + confirm → server action → success state with a
 * link to /login. Server `fieldErrors` (policy issue codes) render under the field; non-field failures in an Alert.
 */
import { CheckCircle2, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { activateAccountAction, resetPasswordAction } from "@/features/auth/actions";
import type { FieldErrors, Result } from "@/lib/result";
import { NewPasswordFields } from "./password-fields";

export function TokenPasswordForm({
  token,
  purpose,
  minLength,
}: {
  token: string;
  purpose: "RESET" | "ACTIVATE";
  minLength: number;
}) {
  const t = useTranslations("auth");
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done)
    return (
      <div className="space-y-5 text-center" data-testid="token-done">
        <CheckCircle2 className="mx-auto size-10 text-primary" aria-hidden />
        <p className="text-sm leading-7">{t(purpose === "RESET" ? "resetDone" : "activateDone")}</p>
        <Button asChild size="lg" className="min-h-11 w-full font-semibold">
          <Link href="/login">{t("goToLogin")}</Link>
        </Button>
      </div>
    );

  return (
    <form
      noValidate
      className="space-y-5"
      data-testid="token-form"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const input = {
          token,
          password: String(fd.get("password") ?? ""),
          confirm: String(fd.get("confirm") ?? ""),
        };
        start(async () => {
          const r: Result<{ email: string }> =
            purpose === "RESET" ? await resetPasswordAction(input) : await activateAccountAction(input);
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            setMessage(r.fieldErrors ? null : r.message);
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
      <NewPasswordFields errors={errors} minLength={minLength} />
      <Button type="submit" size="lg" className="min-h-11 w-full gap-2 font-semibold" disabled={pending}>
        <KeyRound className="size-4" aria-hidden />
        {pending ? t("submitting") : t(purpose === "RESET" ? "resetSubmit" : "activateSubmit")}
      </Button>
    </form>
  );
}
