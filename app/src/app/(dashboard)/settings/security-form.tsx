"use client";

import { Eye, EyeOff, KeyRound, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { FieldError, TextField } from "@/components/forms/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setSecretSettingAction, updateSecurityAction } from "@/features/settings/actions";
import type { EmailView, SecurityView } from "@/features/settings/queries";
import { SaveButton, SettingsSection, useSettingsSubmit } from "./form-shell";

type Props = { initial: SecurityView; email: EmailView; canEdit: boolean; canEmail: boolean };

export function SecurityForm({ initial, email, canEdit, canEmail }: Props) {
  const t = useTranslations("settings");
  const f = useFormatter();
  const { pending, errors, submit } = useSettingsSubmit();
  const secret = useSettingsSubmit();
  const [requireSymbol, setRequireSymbol] = useState(initial.passwordRequireSymbol);
  const [forceChange, setForceChange] = useState(initial.forcePasswordChangeOnNextLogin);
  const [mfaRoles, setMfaRoles] = useState<Set<string>>(new Set(initial.mfaRequiredRoles));
  const [smtpPassword, setSmtpPassword] = useState("");
  const [show, setShow] = useState(false);

  const num = (id: keyof SecurityView, label: string, hint: string, min: number, max: number) => (
    <TextField
      id={id}
      name={id}
      type="number"
      inputMode="numeric"
      label={label}
      hint={hint}
      errors={errors}
      defaultValue={String(initial[id])}
      min={min}
      max={max}
      dir="ltr"
      required
    />
  );

  return (
    <div className="grid gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const v: Record<string, unknown> = {};
          for (const k of [
            "passwordMinLength",
            "passwordMaxAgeDays",
            "sessionIdleMinutes",
            "sessionMaxDays",
            "lockoutMaxFails",
            "lockoutWindowMinutes",
          ])
            v[k] = fd.get(k);
          v.passwordRequireSymbol = requireSymbol;
          v.forcePasswordChangeOnNextLogin = forceChange;
          v.mfaRequiredRoles = [...mfaRoles];
          submit(() => updateSecurityAction(v));
        }}
        noValidate
        data-testid="security-form"
      >
        <fieldset disabled={!canEdit || pending} className="grid gap-4">
          <SettingsSection title={t("security.passwords")} description={t("security.passwordsHint")}>
            <div className="grid gap-4 sm:grid-cols-2">
              {num(
                "passwordMinLength",
                t("security.passwordMinLength"),
                t("security.passwordMinLengthHint"),
                10,
                64,
              )}
              {num(
                "passwordMaxAgeDays",
                t("security.passwordMaxAgeDays"),
                t("security.passwordMaxAgeDaysHint"),
                0,
                365,
              )}
            </div>
            <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3">
              <span className="text-sm">{t("security.passwordRequireSymbol")}</span>
              <Switch
                checked={requireSymbol}
                onCheckedChange={setRequireSymbol}
                aria-label={t("security.passwordRequireSymbol")}
                data-testid="require-symbol"
              />
            </label>
            <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3">
              <span className="text-sm">
                {t("security.forceChange")}
                <span className="block text-xs text-muted-foreground">{t("security.forceChangeHint")}</span>
              </span>
              <Switch
                checked={forceChange}
                onCheckedChange={setForceChange}
                aria-label={t("security.forceChange")}
                data-testid="force-change"
              />
            </label>
          </SettingsSection>

          <SettingsSection title={t("security.sessions")} description={t("security.sessionsHint")}>
            <div className="grid gap-4 sm:grid-cols-2">
              {num(
                "sessionIdleMinutes",
                t("security.sessionIdleMinutes"),
                t("security.sessionIdleMinutesHint"),
                0,
                1440,
              )}
              {num("sessionMaxDays", t("security.sessionMaxDays"), t("security.sessionMaxDaysHint"), 1, 90)}
              {num(
                "lockoutMaxFails",
                t("security.lockoutMaxFails"),
                t("security.lockoutMaxFailsHint"),
                3,
                20,
              )}
              {num(
                "lockoutWindowMinutes",
                t("security.lockoutWindowMinutes"),
                t("security.lockoutWindowMinutesHint"),
                1,
                1440,
              )}
            </div>
          </SettingsSection>

          <SettingsSection
            title={t("security.mfa")}
            description={t("security.mfaHint")}
            footer={canEdit ? <SaveButton pending={pending} /> : undefined}
          >
            <ul className="grid gap-2 sm:grid-cols-2" aria-label={t("security.mfa")}>
              {initial.roles.map((r) => {
                const id = `mfa-${r.code}`;
                return (
                  <li
                    key={r.code}
                    className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3"
                  >
                    <Checkbox
                      id={id}
                      checked={mfaRoles.has(r.code)}
                      onCheckedChange={(c) =>
                        setMfaRoles((prev) => {
                          const n = new Set(prev);
                          if (c === true) n.add(r.code);
                          else n.delete(r.code);
                          return n;
                        })
                      }
                    />
                    <Label htmlFor={id} className="flex-1 cursor-pointer">
                      {r.name}{" "}
                      <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                        {r.code}
                      </span>
                    </Label>
                  </li>
                );
              })}
            </ul>
            <FieldError errors={errors} name="mfaRequiredRoles" />
            <p className="text-xs text-muted-foreground">{t("security.mfaNote")}</p>
          </SettingsSection>
        </fieldset>
      </form>

      {/* Secret path (P2-07 SMTP) — real encryption end-to-end today; value is never echoed back. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          secret.submit(
            () => setSecretSettingAction({ key: "email.smtpPassword", value: smtpPassword }),
            () => setSmtpPassword(""),
          );
        }}
        noValidate
        data-testid="secret-form"
      >
        <fieldset disabled={!canEmail || secret.pending} className="grid gap-4">
          <SettingsSection
            title={t("security.secrets")}
            description={t("security.secretsHint")}
            footer={
              canEmail ? (
                <>
                  {email.smtpPassword.hasValue && (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 gap-2 text-destructive"
                      onClick={() =>
                        secret.submit(() => setSecretSettingAction({ key: "email.smtpPassword", value: "" }))
                      }
                      data-testid="secret-clear"
                    >
                      <Trash2 className="size-4" aria-hidden /> {t("security.secretClear")}
                    </Button>
                  )}
                  <SaveButton
                    pending={secret.pending}
                    label={t("security.secretSave")}
                    testId="secret-save"
                  />
                </>
              ) : undefined
            }
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <KeyRound className="size-4 text-muted-foreground" aria-hidden />
              <span>{t("security.smtpPassword")}</span>
              {email.smtpPassword.hasValue ? (
                <Badge variant="outline" className="font-mono" dir="ltr" data-testid="secret-state">
                  {email.smtpPassword.masked}
                </Badge>
              ) : (
                <Badge variant="secondary" data-testid="secret-state">
                  {t("security.secretUnset")}
                </Badge>
              )}
              {email.smtpPassword.updatedAt && email.smtpPassword.hasValue && (
                <span className="text-xs text-muted-foreground">
                  {f.dateTime(email.smtpPassword.updatedAt, { dateStyle: "medium", timeStyle: "short" })}
                </span>
              )}
            </div>
            <div className="relative">
              <Input
                id="smtpPassword"
                type={show ? "text" : "password"}
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                placeholder={email.smtpPassword.hasValue ? "••••••••" : t("security.secretPlaceholder")}
                autoComplete="new-password"
                className="min-h-11 pe-11"
                dir="ltr"
                aria-label={t("security.smtpPassword")}
                data-testid="secret-input"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute end-1 top-1/2 size-9 -translate-y-1/2"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? t("security.hide") : t("security.show")}
              >
                {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </Button>
            </div>
          </SettingsSection>
        </fieldset>
      </form>
    </div>
  );
}
