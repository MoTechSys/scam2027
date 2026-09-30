"use client";

/**
 * Profile shell (P1-14): URL tabs → one section per tab inside the ScrollRegion (ADR-0008).
 * info: identity form + avatar upload/remove · password: reuses the auth ChangePasswordForm (not forced) ·
 * appearance: DARK / LIGHT / SYSTEM persisted via updateThemeAction and applied instantly · notifications: shared
 * Preferences component from the notification centre.
 */
import { Camera, Monitor, Moon, Sun, Trash2, type LucideIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageTabs } from "@/components/ui/page-tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PreferenceRow } from "@/features/notifications/queries";
import { removeAvatarAction, updateProfileAction, updateThemeAction } from "@/features/profile/actions";
import type { ProfileView } from "@/features/profile/queries";
import { AVATAR_MAX_BYTES, THEMES, type ProfileTab, type Theme } from "@/features/profile/schemas";
import type { FieldErrors, Result } from "@/lib/result";
import { applyThemeToDocument } from "@/lib/theme";
import { ChangePasswordForm } from "@/app/(auth)/change-password/change-password-form";
import { Preferences } from "../notifications/preferences";

export type ProfileData =
  | { tab: "info"; profile: ProfileView }
  | { tab: "password"; minLength: number; passwordChangedAt: Date | null }
  | { tab: "appearance"; theme: Theme }
  | { tab: "notifications"; prefs: PreferenceRow[] };

export function ProfileClient({ data, tabs }: { data: ProfileData; tabs: readonly ProfileTab[] }) {
  const t = useTranslations("profile");
  const router = useRouter();
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:gap-4" data-testid="page-shell">
      <PageTabs
        tabs={tabs.map((id) => ({ id, label: t(`tabs.${id}`) }))}
        activeTab={data.tab}
        onTabChange={(id) => router.push(`/profile/${id as ProfileTab}`)}
      />
      <ScrollRegion label={t("title")} className="-mx-1 px-1">
        <div className="mx-auto max-w-3xl pb-6">
          {data.tab === "info" && <InfoTab profile={data.profile} />}
          {data.tab === "password" && (
            <PasswordTab minLength={data.minLength} changedAt={data.passwordChangedAt} />
          )}
          {data.tab === "appearance" && <AppearanceTab theme={data.theme} />}
          {data.tab === "notifications" && <Preferences prefs={data.prefs} />}
        </div>
      </ScrollRegion>
    </div>
  );
}

/* ───────────── info ───────────── */
function InfoTab({ profile }: { profile: ProfileView }) {
  const t = useTranslations("profile");
  const tc = useTranslations("common");
  const f = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const initials = profile.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join("");

  const upload = (file: File) => {
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error(t("avatar.tooLarge"));
      return;
    }
    const fd = new FormData();
    fd.set("avatar", file);
    start(async () => {
      const res = await fetch("/api/profile/avatar", { method: "POST", body: fd });
      const body = (await res.json()) as Result<{ avatarUrl: string }>;
      if (!body.ok) {
        toast.error(body.message);
        return;
      }
      toast.success(t("avatar.saved"));
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <section
        className="flex flex-col items-center gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-6"
        data-testid="avatar-section"
      >
        <Avatar className="size-24 border border-border">
          {profile.avatarUrl && (
            <AvatarImage src={profile.avatarUrl} alt={t("avatar.alt")} data-testid="avatar-img" />
          )}
          <AvatarFallback className="bg-primary/15 text-2xl font-bold text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <p className="text-lg font-semibold">{profile.name}</p>
          <p className="text-xs text-muted-foreground">{profile.roles.join(" · ")}</p>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/webp,image/jpeg"
              className="hidden"
              data-testid="avatar-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="min-h-10 gap-2"
              onClick={() => fileRef.current?.click()}
              disabled={pending}
              data-testid="avatar-upload"
            >
              <Camera className="size-4" aria-hidden /> {t("avatar.change")}
            </Button>
            {profile.avatarUrl && (
              <Button
                type="button"
                variant="ghost"
                className="min-h-10 gap-2 text-destructive"
                disabled={pending}
                data-testid="avatar-remove"
                onClick={() =>
                  start(async () => {
                    const r = await removeAvatarAction();
                    if (!r.ok) toast.error(r.message);
                    else {
                      toast.success(t("avatar.removed"));
                      router.refresh();
                    }
                  })
                }
              >
                <Trash2 className="size-4" aria-hidden /> {t("avatar.remove")}
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">{t("avatar.hint")}</p>
        </div>
      </section>

      <form
        noValidate
        className="space-y-4 rounded-lg border border-border p-4 sm:p-6"
        data-testid="profile-form"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const input = {
            name: String(fd.get("name") ?? ""),
            phone: String(fd.get("phone") ?? ""),
            title: String(fd.get("title") ?? ""),
            bio: String(fd.get("bio") ?? ""),
            locale: String(fd.get("locale") ?? profile.locale),
          };
          start(async () => {
            const r = await updateProfileAction(input);
            if (!r.ok) {
              setErrors(r.fieldErrors ?? {});
              if (!r.fieldErrors) toast.error(r.message);
              return;
            }
            setErrors({});
            toast.success(t("saved"));
            router.refresh();
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadOnly label={t("fields.email")} value={profile.email} ltr />
          <ReadOnly label={t("fields.academicId")} value={profile.academicId} ltr />
          <Field id={`${id}-name`} label={t("fields.name")} error={errors.name?.[0]}>
            <Input
              id={`${id}-name`}
              name="name"
              defaultValue={profile.name}
              maxLength={120}
              required
              className="min-h-11"
              aria-invalid={!!errors.name}
              data-testid="pf-name"
            />
          </Field>
          <Field id={`${id}-phone`} label={t("fields.phone")} error={errors.phone?.[0]}>
            <Input
              id={`${id}-phone`}
              name="phone"
              defaultValue={profile.phone ?? ""}
              inputMode="tel"
              dir="ltr"
              maxLength={30}
              className="min-h-11"
              aria-invalid={!!errors.phone}
              data-testid="pf-phone"
            />
          </Field>
          <Field id={`${id}-title`} label={t("fields.title")} error={errors.title?.[0]}>
            <Input
              id={`${id}-title`}
              name="title"
              defaultValue={profile.title ?? ""}
              maxLength={80}
              className="min-h-11"
              data-testid="pf-title"
            />
          </Field>
          <Field id={`${id}-locale`} label={t("fields.locale")}>
            <Select name="locale" defaultValue={profile.locale}>
              <SelectTrigger id={`${id}-locale`} className="min-h-11" data-testid="pf-locale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ar" className="min-h-10">
                  {t("locales.ar")}
                </SelectItem>
                <SelectItem value="en" className="min-h-10">
                  {t("locales.en")}
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id={`${id}-bio`} label={t("fields.bio")} error={errors.bio?.[0]} className="sm:col-span-2">
            <Textarea
              id={`${id}-bio`}
              name="bio"
              defaultValue={profile.bio ?? ""}
              maxLength={500}
              rows={3}
              data-testid="pf-bio"
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            {t("meta.joined", { date: f.dateTime(profile.createdAt, { dateStyle: "medium" }) })}
            {profile.lastLoginAt &&
              ` · ${t("meta.lastLogin", { date: f.dateTime(profile.lastLoginAt, { dateStyle: "medium", timeStyle: "short" }) })}`}
          </p>
          <Button type="submit" className="min-h-11" disabled={pending} data-testid="pf-save">
            {pending ? tc("loading") : tc("save")}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ReadOnly({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div
        className="flex min-h-11 items-center rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground"
        dir={ltr ? "ltr" : undefined}
      >
        {value}
      </div>
    </div>
  );
}

/* ───────────── password ───────────── */
function PasswordTab({ minLength, changedAt }: { minLength: number; changedAt: Date | null }) {
  const t = useTranslations("profile");
  const f = useFormatter();
  return (
    <section className="space-y-4 rounded-lg border border-border p-4 sm:p-6" data-testid="password-section">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t("password.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {changedAt
            ? t("password.lastChanged", { date: f.dateTime(changedAt, { dateStyle: "medium" }) })
            : t("password.neverChanged")}
        </p>
      </div>
      <ChangePasswordForm reason={null} forced={false} minLength={minLength} next="/profile/password" />
    </section>
  );
}

/* ───────────── appearance ───────────── */
const THEME_ICON: Record<Theme, LucideIcon> = { DARK: Moon, LIGHT: Sun, SYSTEM: Monitor };

function AppearanceTab({ theme }: { theme: Theme }) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [value, setValue] = useState<Theme>(theme);
  const [, start] = useTransition();
  const choose = (next: Theme) => {
    setValue(next);
    applyThemeToDocument(next);
    start(async () => {
      const r = await updateThemeAction({ theme: next });
      if (!r.ok) toast.error(r.message);
      else {
        toast.success(t("appearance.saved"));
        router.refresh();
      }
    });
  };
  return (
    <section
      className="space-y-4 rounded-lg border border-border p-4 sm:p-6"
      data-testid="appearance-section"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t("appearance.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("appearance.desc")}</p>
      </div>
      <RadioGroup
        value={value}
        onValueChange={(v) => choose(v as Theme)}
        className="grid gap-3 sm:grid-cols-3"
        aria-label={t("appearance.title")}
      >
        {THEMES.map((th) => {
          const Icon = THEME_ICON[th];
          const active = value === th;
          return (
            <Label
              key={th}
              htmlFor={`theme-${th}`}
              className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border p-4 text-sm transition-colors ${active ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`}
              data-testid={`theme-${th}`}
              data-active={active}
            >
              <RadioGroupItem id={`theme-${th}`} value={th} className="sr-only" />
              <Icon className={`size-6 ${active ? "text-primary" : "text-muted-foreground"}`} aria-hidden />
              <span className="font-medium">{t(`appearance.${th}`)}</span>
              {active && <Badge className="text-[10px]">{t("appearance.current")}</Badge>}
            </Label>
          );
        })}
      </RadioGroup>
    </section>
  );
}
