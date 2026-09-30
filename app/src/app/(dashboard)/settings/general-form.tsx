"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { SelectField, TextField, formValues } from "@/components/forms/fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateGeneralAction } from "@/features/settings/actions";
import type { GeneralView } from "@/features/settings/queries";
import { SaveButton, SettingsSection, useSettingsSubmit } from "./form-shell";

/** Common IANA zones for the region first, then everything the runtime knows. */
const PREFERRED_TZ = [
  "Asia/Riyadh",
  "Asia/Aden",
  "Asia/Dubai",
  "Asia/Kuwait",
  "Asia/Qatar",
  "Asia/Bahrain",
  "Asia/Muscat",
  "Asia/Amman",
  "Africa/Cairo",
  "Europe/London",
  "UTC",
];

function allTimeZones(): string[] {
  const known = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return [...PREFERRED_TZ, ...known.filter((z) => !PREFERRED_TZ.includes(z))];
}

export function GeneralForm({ initial, canEdit }: { initial: GeneralView; canEdit: boolean }) {
  const t = useTranslations("settings");
  const { pending, errors, submit } = useSettingsSubmit();
  const [locale, setLocale] = useState(initial.locale);
  const [timezone, setTimezone] = useState(initial.timezone);
  const zones = useMemo(() => allTimeZones(), []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = formValues(new FormData(e.currentTarget));
        submit(() => updateGeneralAction(v));
      }}
      noValidate
      data-testid="general-form"
    >
      <fieldset disabled={!canEdit || pending} className="grid gap-4">
        <SettingsSection
          title={t("general.identity")}
          description={t("general.identityHint", { slug: initial.slug })}
          footer={canEdit ? <SaveButton pending={pending} /> : undefined}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="name"
              name="name"
              label={t("general.name")}
              errors={errors}
              defaultValue={initial.name}
              required
              maxLength={120}
            />
            <TextField
              id="nameEn"
              name="nameEn"
              label={t("general.nameEn")}
              errors={errors}
              defaultValue={initial.nameEn}
              optional
              dir="ltr"
              maxLength={120}
            />
            <SelectField
              id="locale"
              name="locale"
              label={t("general.locale")}
              errors={errors}
              value={locale}
              onChange={(v) => setLocale(v as "ar" | "en")}
              options={[
                { id: "ar", label: t("general.localeAr") },
                { id: "en", label: t("general.localeEn") },
              ]}
            />
            <div className="space-y-1.5">
              <Label htmlFor="timezone">{t("general.timezone")}</Label>
              <Input
                id="timezone"
                name="timezone"
                list="tz-options"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="min-h-11"
                dir="ltr"
                aria-invalid={!!errors.timezone}
                autoComplete="off"
              />
              <datalist id="tz-options">
                {zones.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
              {errors.timezone?.[0] && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.timezone[0]}
                </p>
              )}
            </div>
            <TextField
              id="supportEmail"
              name="supportEmail"
              type="email"
              label={t("general.supportEmail")}
              hint={t("general.supportEmailHint")}
              errors={errors}
              defaultValue={initial.supportEmail}
              optional
              dir="ltr"
            />
            <TextField
              id="academicIdFormat"
              name="academicIdFormat"
              label={t("general.academicIdFormat")}
              hint={t("general.academicIdFormatHint")}
              errors={errors}
              defaultValue={initial.academicIdFormat}
              dir="ltr"
              className="font-mono"
            />
          </div>
          {initial.customDomain && (
            <p className="text-xs text-muted-foreground">
              {t("general.customDomain")}:{" "}
              <span dir="ltr" className="font-mono">
                {initial.customDomain}
              </span>
            </p>
          )}
        </SettingsSection>
      </fieldset>
    </form>
  );
}
