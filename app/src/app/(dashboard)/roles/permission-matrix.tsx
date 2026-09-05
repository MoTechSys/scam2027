"use client";

/**
 * Permission matrix (FR-ROL-002) — permissions grouped by catalogue category, collapsible per category with a
 * tri-state "select all" header. Permissions the actor does not hold are disabled (FR-ROL-006) and, when the role
 * already has them (e.g. viewing a superior role), shown as locked so the actor cannot silently drop them either.
 *
 * Controlled component: `value` is the set of selected codes; `onChange` receives the next set.
 */
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { permissionCategories, SELF_SCOPE_PERMISSIONS, type PermissionCode } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

type Props = {
  value: ReadonlySet<string>;
  onChange?: (next: Set<string>) => void;
  /** Codes the actor is allowed to grant/revoke (their own permissions). */
  grantable: ReadonlySet<string>;
  readOnly?: boolean;
  /** Name attribute for uncontrolled form submission of the selected codes. */
  name?: string;
  className?: string;
};

const CATEGORIES = permissionCategories();

export function PermissionMatrix({ value, onChange, grantable, readOnly = false, name, className }: Props) {
  const t = useTranslations("roles.matrix");
  const tp = useTranslations("permissions");
  const [open, setOpen] = useState<string[]>(() => CATEGORIES.slice(0, 3).map((c) => c.key));

  /** A code can be toggled only when the actor holds it (self-scope codes are always grantable: no admin power). */
  const canToggle = (code: PermissionCode) => !readOnly && !!onChange && (grantable.has(code) || SELF_SCOPE_PERMISSIONS.has(code));

  const stats = useMemo(
    () =>
      CATEGORIES.map((c) => {
        const selected = c.permissions.filter((p) => value.has(p.code)).length;
        const toggleable = c.permissions.filter((p) => canToggle(p.code));
        const toggleableSelected = toggleable.filter((p) => value.has(p.code)).length;
        return { key: c.key, selected, total: c.permissions.length, toggleable: toggleable.length, toggleableSelected };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, grantable, readOnly],
  );

  const setMany = (codes: PermissionCode[], on: boolean) => {
    if (!onChange) return;
    const next = new Set(value);
    for (const c of codes) {
      if (!canToggle(c)) continue;
      if (on) next.add(c);
      else next.delete(c);
    }
    onChange(next);
  };

  const allToggleable = CATEGORIES.flatMap((c) => c.permissions.map((p) => p.code)).filter(canToggle);

  return (
    <div className={cn("space-y-3", className)}>
      {name && [...value].map((code) => <input key={code} type="hidden" name={name} value={code} />)}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("selected", { count: value.size })}
          {readOnly && <Badge variant="outline" className="ms-2">{t("readOnly")}</Badge>}
        </p>
        {!readOnly && onChange && (
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="sm" className="min-h-9" onClick={() => setMany(allToggleable, true)}>
              {t("selectAll")}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="min-h-9" onClick={() => setMany(allToggleable, false)}>
              {t("clearAll")}
            </Button>
          </div>
        )}
      </div>

      <Accordion type="multiple" value={open} onValueChange={setOpen} className="rounded-lg border border-border">
        {CATEGORIES.map((cat, i) => {
          const s = stats[i]!;
          const label = tp.has(`categories.${cat.key}`) ? tp(`categories.${cat.key}`) : cat.label;
          const headerState: boolean | "indeterminate" = s.selected === 0 ? false : s.selected === s.total ? true : "indeterminate";
          const headerDisabled = readOnly || !onChange || s.toggleable === 0;
          return (
            <AccordionItem key={cat.key} value={cat.key} data-category={cat.key} className="px-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  aria-label={t("toggleCategory", { category: label })}
                  checked={headerState}
                  disabled={headerDisabled}
                  onCheckedChange={(v) => setMany(cat.permissions.map((p) => p.code), v === true)}
                  className="size-5"
                />
                <AccordionTrigger className="min-h-11 flex-1 py-2 hover:no-underline">
                  <span className="flex flex-1 items-center gap-2 text-start">
                    <span className="font-medium">{label}</span>
                    <Badge variant={s.selected === s.total ? "default" : s.selected ? "secondary" : "outline"} className="font-mono text-[11px]">
                      {s.selected}/{s.total}
                    </Badge>
                  </span>
                </AccordionTrigger>
              </div>
              <AccordionContent className="pb-3">
                <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label={label}>
                  {cat.permissions.map((p) => {
                    const checked = value.has(p.code);
                    const toggle = canToggle(p.code);
                    const locked = !toggle && !readOnly;
                    const id = `perm-${p.code.replace(/\./g, "-")}`;
                    const resource = tp.has(`resources.${p.group}`) ? tp(`resources.${p.group}`) : p.group;
                    const desc = tp.has(`codes.${p.code.replace(/\./g, "_")}`) ? tp(`codes.${p.code.replace(/\./g, "_")}`) : p.description;
                    return (
                      <li key={p.code}>
                        <label
                          htmlFor={id}
                          className={cn(
                            "flex min-h-11 cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40",
                            (!toggle || readOnly) && "cursor-default",
                            locked && !checked && "opacity-50",
                          )}
                          title={locked ? t("notOwned") : undefined}
                        >
                          <Checkbox
                            id={id}
                            checked={checked}
                            disabled={!toggle}
                            onCheckedChange={(v) => setMany([p.code], v === true)}
                            className="mt-0.5 size-5"
                            aria-describedby={`${id}-code`}
                          />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="leading-tight">
                              <span className="text-muted-foreground">{resource} · </span>
                              {desc}
                              {SELF_SCOPE_PERMISSIONS.has(p.code) && (
                                <Badge variant="outline" className="ms-1 align-middle text-[10px]">{t("selfScope")}</Badge>
                              )}
                            </span>
                            <span id={`${id}-code`} dir="ltr" className="font-mono text-[11px] text-muted-foreground">
                              {p.code}
                            </span>
                          </span>
                          {locked && checked && <Lock className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-label={t("notOwned")} />}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
