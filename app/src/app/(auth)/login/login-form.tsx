"use client";

import { Eye, EyeOff, LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LoginState } from "@/lib/auth/login-errors";
import { loginAction } from "./actions";

type Props = { next?: string; reason?: string };

export function LoginForm({ next, reason }: Props) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, { error: null });
  const [showPassword, setShowPassword] = useState(false);
  const idId = useId();
  const pwId = useId();
  const rememberId = useId();
  const errId = useId();

  const reasonMsg = reason && t.has(`reasons.${reason}`) ? t(`reasons.${reason}` as never) : null;
  const isInfo = reason === "signed_out";

  return (
    <form action={action} className="space-y-5" noValidate aria-describedby={state.error ? errId : undefined}>
      {next && <input type="hidden" name="next" value={next} />}

      {reasonMsg && !state.error && (
        <Alert variant={isInfo ? "default" : "destructive"} role="status">
          <AlertDescription>{reasonMsg}</AlertDescription>
        </Alert>
      )}
      {state.error && (
        <Alert variant="destructive" id={errId} role="alert">
          <AlertDescription>{t(`errors.${state.error}`)}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor={idId}>{t("identifier")}</Label>
        <Input
          id={idId}
          name="identifier"
          type="text"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          dir="ltr"
          defaultValue={state.identifier ?? ""}
          placeholder={t("identifierPlaceholder")}
          className="min-h-11 text-start"
          aria-invalid={state.error === "VALIDATION" || state.error === "INVALID_CREDENTIALS" || undefined}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={pwId}>{t("password")}</Label>
        <div className="relative">
          <Input
            id={pwId}
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            dir="ltr"
            className="min-h-11 pe-12 text-start"
            aria-invalid={state.error === "VALIDATION" || state.error === "INVALID_CREDENTIALS" || undefined}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            aria-pressed={showPassword}
            className="absolute end-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {showPassword ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div className="flex min-h-11 items-center gap-3">
        <Checkbox id={rememberId} name="remember" className="size-5" />
        <Label htmlFor={rememberId} className="cursor-pointer font-normal">
          {t("remember")}
        </Label>
      </div>

      <Button type="submit" size="lg" className="min-h-11 w-full gap-2 font-semibold" disabled={pending}>
        <LogIn className="size-4" aria-hidden="true" />
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
