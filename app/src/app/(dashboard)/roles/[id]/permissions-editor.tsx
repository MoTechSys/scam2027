"use client";

/**
 * Role permissions editor — wraps PermissionMatrix with dirty-state tracking and a sticky save bar.
 * Read-only for system roles (FR-ROL-005) or when the actor lacks role.edit_permissions.
 */
import { Loader2, Save, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setRolePermissionsAction } from "@/features/roles/actions";
import { PermissionMatrix } from "../permission-matrix";

type Props = { roleId: string; initial: string[]; grantable: string[]; readOnly: boolean };

export function PermissionsEditor({ roleId, initial, grantable, readOnly }: Props) {
  const t = useTranslations("roles.matrix");
  const tr = useTranslations("roles");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const grantableSet = useMemo(() => new Set(grantable), [grantable]);
  const initialSet = useMemo(() => new Set(initial), [initial]);
  // Local edits are stored as a diff key so a fresh `initial` from the server (after save + refresh) resets state
  // without a setState-in-effect (React docs: "adjusting state when a prop changes").
  const initialKey = [...initial].sort().join(",");
  const [edited, setEdited] = useState<{ key: string; value: Set<string> } | null>(null);
  const value = edited && edited.key === initialKey ? edited.value : initialSet;
  const setValue = (next: Set<string>) => setEdited({ key: initialKey, value: next });

  const dirty = value.size !== initialSet.size || [...value].some((c) => !initialSet.has(c));

  // Warn before leaving with unsaved changes (WCAG 3.3.4 error prevention).
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = () =>
    start(async () => {
      const r = await setRolePermissionsAction({ id: roleId, permissionCodes: [...value] });
      if (!r.ok) {
        toast.error(r.fieldErrors?.permissionCodes?.[0] ?? r.message);
        return;
      }
      toast.success(tr("toast.permissionsSaved", { count: r.data.count }));
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <PermissionMatrix value={value} onChange={readOnly ? undefined : setValue} grantable={grantableSet} readOnly={readOnly} />
      {!readOnly && (
        <div
          className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-lg sm:border"
          role="region"
          aria-label={t("title")}
        >
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {dirty ? <span className="font-medium text-amber-600 dark:text-amber-400">{t("unsaved")}</span> : t("noChanges")}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="min-h-11 gap-2" disabled={!dirty || pending} onClick={() => setEdited(null)}>
              <Undo2 className="size-4" aria-hidden /> {tc("reset")}
            </Button>
            <Button type="button" className="min-h-11 gap-2" disabled={!dirty || pending} onClick={save}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              {t("saveChanges")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
