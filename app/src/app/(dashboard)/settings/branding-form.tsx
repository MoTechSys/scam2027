"use client";

import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { TextAreaField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { removeLogoAction, updateBrandingAction } from "@/features/settings/actions";
import type { BrandingView } from "@/features/settings/queries";
import { HEX_COLOR, LOGO_MAX_BYTES } from "@/features/settings/schemas";
import { AA_TEXT_CONTRAST, primaryContrast } from "@/lib/color";
import { formatBytes } from "@/lib/storage/validate";
import { SaveButton, SettingsSection, useSettingsSubmit } from "./form-shell";

function ColorField({
  id,
  name,
  label,
  value,
  onChange,
  hint,
  error,
  optional,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string;
  optional?: boolean;
}) {
  const tc = useTranslations("common");
  const valid = HEX_COLOR.test(value);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} {optional && <span className="text-muted-foreground">({tc("optional")})</span>}
      </Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={valid ? value : "#39ff14"}
          onChange={(e) => onChange(e.target.value)}
          className="size-11 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1"
        />
        <input
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="#39ff14"
          dir="ltr"
          maxLength={7}
          className="flex min-h-11 w-full rounded-md border border-input bg-transparent px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-invalid={!!error || (!!value && !valid)}
        />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function BrandingForm({ initial, canEdit }: { initial: BrandingView; canEdit: boolean }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const { pending, errors, submit } = useSettingsSubmit();
  const [primary, setPrimary] = useState(initial.primaryColor);
  const [accent, setAccent] = useState(initial.accentColor ?? "");
  // Live WCAG AA read-out for the picked primary (the server rejects failing colours — same function).
  const contrast = HEX_COLOR.test(primary) ? primaryContrast(primary) : null;
  const [uploading, startUpload] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = (file: File) =>
    startUpload(async () => {
      if (file.size > LOGO_MAX_BYTES)
        return void toast.error(t("branding.logoTooLarge", { max: formatBytes(LOGO_MAX_BYTES) }));
      const fd = new FormData();
      fd.set("logo", file);
      const res = await fetch("/api/branding/logo", { method: "POST", body: fd });
      const json = (await res.json().catch(() => null)) as { ok: boolean; message?: string } | null;
      if (!res.ok || !json?.ok) return void toast.error(json?.message ?? t("branding.logoFailed"));
      toast.success(t("branding.logoSaved"));
      router.refresh();
    });

  const preview = (
    <div className="flex items-center gap-4">
      <div
        className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card"
        style={{ ["--primary" as string]: HEX_COLOR.test(primary) ? primary : undefined }}
      >
        {initial.logoUrl ? (
          <Image
            src={initial.logoUrl}
            alt=""
            width={80}
            height={80}
            className="size-20 object-contain"
            unoptimized
            data-testid="logo-preview"
          />
        ) : (
          <div
            className="flex size-20 items-center justify-center bg-primary text-3xl font-black text-primary-foreground"
            aria-hidden
          >
            <ImageIcon className="size-8 opacity-70" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-xs text-muted-foreground">
          {t("branding.logoHint", { max: formatBytes(LOGO_MAX_BYTES) })}
        </p>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/svg+xml,image/webp,image/jpeg"
              className="sr-only"
              aria-label={t("branding.uploadLogo")}
              data-testid="logo-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="min-h-10 gap-2"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              data-testid="logo-upload"
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="size-4" aria-hidden />
              )}
              {initial.logoUrl ? t("branding.replaceLogo") : t("branding.uploadLogo")}
            </Button>
            {initial.logoUrl && (
              <Button
                type="button"
                variant="ghost"
                className="min-h-10 gap-2 text-destructive"
                disabled={uploading}
                onClick={() =>
                  startUpload(async () => {
                    const r = await removeLogoAction();
                    if (!r.ok) return void toast.error(r.message);
                    toast.success(t("branding.logoRemoved"));
                    router.refresh();
                  })
                }
                data-testid="logo-remove"
              >
                <Trash2 className="size-4" aria-hidden /> {t("branding.removeLogo")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        submit(() =>
          updateBrandingAction({
            primaryColor: fd.get("primaryColor"),
            accentColor: fd.get("accentColor") ?? "",
            loginMessage: fd.get("loginMessage") ?? "",
          }),
        );
      }}
      noValidate
      data-testid="branding-form"
    >
      <div className="grid gap-4">
        <SettingsSection
          title={t("branding.logo")}
          description={t("branding.logoDesc")}
          testId="logo-section"
        >
          {preview}
        </SettingsSection>
        <fieldset disabled={!canEdit || pending} className="grid gap-4">
          <SettingsSection
            title={t("branding.colors")}
            description={t("branding.colorsHint")}
            footer={canEdit ? <SaveButton pending={pending} /> : undefined}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField
                id="primaryColor"
                name="primaryColor"
                label={t("branding.primaryColor")}
                value={primary}
                onChange={setPrimary}
                hint={t("branding.primaryColorHint")}
                error={errors.primaryColor?.[0]}
              />
              <ColorField
                id="accentColor"
                name="accentColor"
                label={t("branding.accentColor")}
                value={accent}
                onChange={setAccent}
                error={errors.accentColor?.[0]}
                optional
              />
            </div>
            {contrast && (
              <p
                className={contrast.passesAA ? "text-xs text-muted-foreground" : "text-xs text-destructive"}
                role={contrast.passesAA ? undefined : "alert"}
                data-testid="contrast-readout"
                data-passes={String(contrast.passesAA)}
              >
                {t(contrast.passesAA ? "branding.contrastOk" : "branding.contrastLow", {
                  ratio: contrast.min.toFixed(2),
                  min: AA_TEXT_CONTRAST,
                })}
              </p>
            )}
            <div
              className="flex items-center gap-3 rounded-xl border border-border p-3"
              style={{ ["--primary" as string]: HEX_COLOR.test(primary) ? primary : undefined }}
              aria-hidden
            >
              <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary font-black text-primary-foreground">
                ج
              </span>
              <span className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
                {t("branding.previewButton")}
              </span>
              <span className="text-sm text-primary">{t("branding.previewLink")}</span>
            </div>
            <TextAreaField
              id="loginMessage"
              name="loginMessage"
              label={t("branding.loginMessage")}
              hint={t("branding.loginMessageHint")}
              errors={errors}
              defaultValue={initial.loginMessage}
              optional
              maxLength={240}
              rows={2}
            />
          </SettingsSection>
        </fieldset>
      </div>
    </form>
  );
}
