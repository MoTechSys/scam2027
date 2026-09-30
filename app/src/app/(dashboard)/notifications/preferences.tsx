"use client";

/** In-app notification preferences — shared by /notifications (PREFS tab) and /profile/notifications (P1-14). */
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { savePreferencesAction } from "@/features/notifications/actions";
import type { PreferenceRow } from "@/features/notifications/queries";

export function Preferences({ prefs }: { prefs: PreferenceRow[] }) {
  const t = useTranslations("notifications");
  const tc = useTranslations("common");
  const router = useRouter();
  const [state, setState] = useState(prefs);
  const [pending, start] = useTransition();
  const dirty = state.some((s, i) => s.enabled !== prefs[i]?.enabled);

  const save = () =>
    start(async () => {
      const r = await savePreferencesAction({ items: state });
      if (!r.ok) toast.error(r.message);
      else {
        toast.success(t("toast.prefsSaved"));
        router.refresh();
      }
    });

  return (
    <section className="space-y-4 rounded-lg border border-border p-4 sm:p-6" data-testid="prefs">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t("prefs.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("prefs.desc")}</p>
      </div>
      <ul className="divide-y divide-border">
        {state.map((p, i) => (
          <li key={p.type} className="flex min-h-14 items-center justify-between gap-4 py-2">
            <Label htmlFor={`pref-${p.type}`} className="cursor-pointer text-sm">
              {t(`type.${p.type}`)}
            </Label>
            <Switch
              id={`pref-${p.type}`}
              checked={p.enabled}
              onCheckedChange={(v) => setState((s) => s.map((x, j) => (j === i ? { ...x, enabled: v } : x)))}
              data-testid={`pref-${p.type}`}
            />
          </li>
        ))}
        {(["SYSTEM", "SECURITY"] as const).map((type) => (
          <li
            key={type}
            className="flex min-h-14 items-center justify-between gap-4 py-2 text-muted-foreground"
          >
            <span className="text-sm">{t(`type.${type}`)}</span>
            <span className="text-xs">{t("prefs.always")}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button className="min-h-11" onClick={save} disabled={!dirty || pending} data-testid="save-prefs">
          {pending ? tc("loading") : t("prefs.save")}
        </Button>
      </div>
    </section>
  );
}
