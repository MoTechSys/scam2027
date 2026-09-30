"use client";

import { KeyRound, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { changePasswordAction } from "@/features/auth/actions";
import type { ChangeReason } from "@/features/auth/schemas";
import { safeNext } from "@/lib/auth/login-errors";
import type { FieldErrors } from "@/lib/result";
import { logoutAction } from "@/lib/session/actions";
import { NewPasswordFields, PasswordInput } from "../_components/password-fields";

export function ChangePasswordForm({
  reason,
  forced,
  minLength,
  next,
}: {
  reason: ChangeReason | null;
  forced: boolean;
  minLength: number;
  next?: string;
}) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const curId = useId();

  return (
    <form
      noValidate
      className="space-y-5"
      data-testid="change-form"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const input = {
          current: String(fd.get("current") ?? ""),
          password: String(fd.get("password") ?? ""),
          confirm: String(fd.get("confirm") ?? ""),
        };
        start(async () => {
          const r = await changePasswordAction(input);
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            setMessage(r.fieldErrors ? null : r.message);
            return;
          }
          toast.success(t("changeDone", { n: r.data.revokedSessions }));
          router.replace(safeNext(next));
          router.refresh();
        });
      }}
    >
      {reason && (
        <Alert
          variant={forced ? "destructive" : "default"}
          role={forced ? "alert" : "status"}
          data-testid="change-reason"
        >
          <AlertDescription>{t(`changeReasons.${reason}`)}</AlertDescription>
        </Alert>
      )}
      {message && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      <PasswordInput
        id={curId}
        name="current"
        label={t("currentPassword")}
        autoComplete="current-password"
        invalid={!!errors.current}
        describedBy={`${curId}-error`}
      />
      {errors.current?.[0] && (
        <p id={`${curId}-error`} className="-mt-3 text-xs text-destructive" role="alert">
          {errors.current[0]}
        </p>
      )}
      <NewPasswordFields errors={errors} minLength={minLength} />
      <Button type="submit" size="lg" className="min-h-11 w-full gap-2 font-semibold" disabled={pending}>
        <KeyRound className="size-4" aria-hidden />
        {pending ? t("submitting") : t("changeSubmit")}
      </Button>
      {forced && (
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 w-full gap-2 text-muted-foreground"
          onClick={() => start(() => logoutAction())}
          disabled={pending}
        >
          <LogOut className="size-4" aria-hidden />
          {t("logout")}
        </Button>
      )}
    </form>
  );
}
