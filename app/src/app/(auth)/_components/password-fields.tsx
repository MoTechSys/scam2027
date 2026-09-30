"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldErrors } from "@/lib/result";

/** Translates machine issue codes (`min:12`, `upper`, …) from features/auth/core.passwordPolicyIssues. */
export function usePasswordIssueText() {
  const t = useTranslations("auth.passwordIssues");
  return (code: string): string => {
    if (code.startsWith("min:")) return t("min", { n: Number(code.slice(4)) });
    return t.has(code as never) ? t(code as never) : code;
  };
}

function PasswordInput({
  id,
  name,
  label,
  autoComplete,
  invalid,
  describedBy,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const t = useTranslations("auth");
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          dir="ltr"
          className="min-h-11 pe-12 text-start"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? t("hidePassword") : t("showPassword")}
          aria-pressed={show}
          className="absolute end-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
        </button>
      </div>
    </div>
  );
}

/**
 * New password + confirmation with translated policy issues. `errors.password` may contain issue codes from the
 * server (`min:12`, `symbol`) or plain Zod messages — both are rendered.
 */
export function NewPasswordFields({ errors, minLength }: { errors: FieldErrors; minLength: number }) {
  const t = useTranslations("auth");
  const issueText = usePasswordIssueText();
  const pwId = useId();
  const cfId = useId();
  const pwErr = errors.password ?? [];
  const cfErr = errors.confirm ?? [];
  return (
    <>
      <PasswordInput
        id={pwId}
        name="password"
        label={t("newPassword")}
        autoComplete="new-password"
        invalid={pwErr.length > 0}
        describedBy={`${pwId}-hint ${pwId}-error`}
      />
      <p id={`${pwId}-hint`} className="-mt-3 text-xs text-muted-foreground">
        {t("passwordHint", { min: minLength })}
      </p>
      {pwErr.length > 0 && (
        <ul id={`${pwId}-error`} className="-mt-3 space-y-0.5 text-xs text-destructive" role="alert">
          {pwErr.map((c) => (
            <li key={c}>{issueText(c)}</li>
          ))}
        </ul>
      )}
      <PasswordInput
        id={cfId}
        name="confirm"
        label={t("confirmPassword")}
        autoComplete="new-password"
        invalid={cfErr.length > 0}
        describedBy={`${cfId}-error`}
      />
      {cfErr.length > 0 && (
        <p id={`${cfId}-error`} className="-mt-3 text-xs text-destructive" role="alert">
          {cfErr[0]}
        </p>
      )}
    </>
  );
}

export { PasswordInput };
