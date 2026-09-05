"use client";

/** Roles dialogs: create (with matrix), edit details, clone. Server fieldErrors are merged into the form. */
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cloneRoleAction, createRoleAction, updateRoleAction } from "@/features/roles/actions";
import type { RoleRow } from "@/features/roles/queries";
import type { FieldErrors } from "@/lib/result";
import { PermissionMatrix } from "./permission-matrix";

function FieldError({ errors, name }: { errors: FieldErrors; name: string }) {
  const msg = errors[name]?.[0];
  return msg ? (
    <p id={`${name}-error`} className="text-xs text-destructive" role="alert">
      {msg}
    </p>
  ) : null;
}

type BaseProps = { open: boolean; onOpenChange: (o: boolean) => void };

export function RoleFormDialog({ open, onOpenChange, role, grantable }: BaseProps & { role: RoleRow | null; grantable: ReadonlySet<string> }) {
  const t = useTranslations("roles");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [codes, setCodes] = useState<Set<string>>(new Set());
  const isEdit = !!role;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const base = {
      name: String(fd.get("name") ?? ""),
      nameEn: String(fd.get("nameEn") ?? ""),
      description: String(fd.get("description") ?? ""),
    };
    start(async () => {
      const res = isEdit
        ? await updateRoleAction({ ...base, id: role.id })
        : await createRoleAction({ ...base, code: String(fd.get("code") ?? ""), permissionCodes: [...codes] });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.message);
        return;
      }
      toast.success(t(isEdit ? "toast.updated" : "toast.created"));
      onOpenChange(false);
      if (isEdit) router.refresh();
      else router.push(`/roles/${res.data.id}`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setErrors({});
          setCodes(new Set());
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className={isEdit ? "sm:max-w-lg" : "max-h-[92dvh] overflow-y-auto sm:max-w-3xl"}>
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <DialogHeader>
            <DialogTitle>{isEdit ? t("editTitle") : t("createTitle")}</DialogTitle>
            <DialogDescription>{isEdit ? role.code : t("createHint")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            {!isEdit && (
              <div className="space-y-1.5">
                <Label htmlFor="r-code">{t("form.code")}</Label>
                <Input
                  id="r-code"
                  name="code"
                  dir="ltr"
                  required
                  autoCapitalize="characters"
                  className="min-h-11 font-mono uppercase"
                  aria-describedby="r-code-hint code-error"
                  aria-invalid={!!errors.code}
                  pattern="[A-Za-z][A-Za-z0-9_]{2,39}"
                />
                <p id="r-code-hint" className="text-xs text-muted-foreground">
                  {t("form.codeHint")}
                </p>
                <FieldError errors={errors} name="code" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="r-name">{t("form.name")}</Label>
              <Input id="r-name" name="name" required defaultValue={role?.name ?? ""} className="min-h-11" aria-invalid={!!errors.name} aria-describedby="name-error" />
              <FieldError errors={errors} name="name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-nameEn">
                {t("form.nameEn")} <span className="text-muted-foreground">({tc("optional")})</span>
              </Label>
              <Input id="r-nameEn" name="nameEn" dir="ltr" defaultValue={role?.nameEn ?? ""} className="min-h-11" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="r-description">
                {t("form.description")} <span className="text-muted-foreground">({tc("optional")})</span>
              </Label>
              <Textarea id="r-description" name="description" rows={2} defaultValue={role?.description ?? ""} placeholder={t("form.descriptionHint")} maxLength={300} />
              <FieldError errors={errors} name="description" />
            </div>
          </div>

          {!isEdit && (
            <section aria-labelledby="r-matrix-title" className="space-y-2">
              <h3 id="r-matrix-title" className="text-sm font-semibold">
                {t("matrix.title")}
              </h3>
              <p className="text-xs text-muted-foreground">{t("matrix.hint")}</p>
              <PermissionMatrix value={codes} onChange={setCodes} grantable={grantable} />
              <FieldError errors={errors} name="permissionCodes" />
            </section>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={pending} className="min-h-11 gap-2">
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {tc("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CloneRoleDialog({ open, onOpenChange, source }: BaseProps & { source: RoleRow | null }) {
  const t = useTranslations("roles");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  if (!source) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => (!o && setErrors({}), onOpenChange(o))}>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const res = await cloneRoleAction({ sourceId: source.id, code: String(fd.get("code") ?? ""), name: String(fd.get("name") ?? "") });
              if (!res.ok) {
                setErrors(res.fieldErrors ?? {});
                toast.error(res.message);
                return;
              }
              toast.success(t("toast.cloned"));
              onOpenChange(false);
              router.push(`/roles/${res.data.id}`);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("cloneTitle", { name: source.name })}</DialogTitle>
            <DialogDescription>{t("cloneHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="c-code">{t("form.code")}</Label>
            <Input id="c-code" name="code" dir="ltr" required defaultValue={`${source.code}_COPY`.slice(0, 40)} className="min-h-11 font-mono uppercase" aria-invalid={!!errors.code} />
            <p className="text-xs text-muted-foreground">{t("form.codeHint")}</p>
            <FieldError errors={errors} name="code" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-name">{t("form.name")}</Label>
            <Input id="c-name" name="name" required defaultValue={`${source.name} (نسخة)`} className="min-h-11" aria-invalid={!!errors.name} />
            <FieldError errors={errors} name="name" />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={pending} className="min-h-11 gap-2">
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("actions.clone")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
