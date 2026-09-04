"use client";

/**
 * Create / edit user dialog. Client-side zod validation mirrors the server schema; server fieldErrors are merged in.
 * On create with no password, the generated temporary password is shown once (copy button).
 */
import { Check, Copy, Eye, EyeOff, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createUserAction, updateUserAction } from "@/features/users/actions";
import type { RoleOption, UserDetail, UserRow } from "@/features/users/queries";
import type { FieldErrors } from "@/lib/result";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roles: RoleOption[];
  user?: (UserRow & Partial<Pick<UserDetail, "profile" | "locale">>) | null;
};

export function UserFormDialog({ open, onOpenChange, roles, user }: Props) {
  const t = useTranslations("users");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showPw, setShowPw] = useState(false);
  const [temp, setTemp] = useState<{ academicId: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const isEdit = !!user;

  function reset() {
    setErrors({});
    setTemp(null);
    setCopied(false);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const roleIds = fd.getAll("roleIds").map(String);
    const base = {
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      title: String(fd.get("title") ?? ""),
    };
    start(async () => {
      if (isEdit) {
        const res = await updateUserAction({ ...base, id: user.id });
        if (!res.ok) {
          setErrors(res.fieldErrors ?? {});
          toast.error(res.message);
          return;
        }
        setErrors({});
        toast.success(t("toast.updated"));
        onOpenChange(false);
        router.refresh();
        return;
      }
      const res = await createUserAction({
            ...base,
            academicId: String(fd.get("academicId") ?? ""),
            password: String(fd.get("password") ?? ""),
            roleIds,
            status: fd.get("statusActive") === "on" ? "ACTIVE" : "PENDING_ACTIVATION",
            mustChangePassword: fd.get("mustChange") === "on",
          });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.message);
        return;
      }
      setErrors({});
      toast.success(t("toast.created", { academicId: res.data.academicId }));
      if (res.data.tempPassword) setTemp({ academicId: res.data.academicId, password: res.data.tempPassword });
      else onOpenChange(false);
      router.refresh();
    });
  }

  async function copy() {
    if (!temp) return;
    await navigator.clipboard.writeText(temp.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const err = (k: string) => errors[k]?.[0];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {temp ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("tempPasswordTitle")}</DialogTitle>
              <DialogDescription>{t("tempPasswordBody")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {t("form.academicId")}: <span className="font-mono text-foreground">{temp.academicId}</span>
              </p>
              <div className="flex items-center gap-2">
                <code dir="ltr" className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-base select-all">
                  {temp.password}
                </code>
                <Button type="button" variant="outline" onClick={copy} className="min-h-11 gap-2">
                  {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                  {copied ? t("copied") : t("copy")}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)} className="min-h-11">
                {tc("close")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{isEdit ? t("editTitle") : t("createTitle")}</DialogTitle>
              <DialogDescription className="sr-only">{t("subtitle")}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="u-name">{t("form.name")}</Label>
                <Input id="u-name" name="name" required defaultValue={user?.name ?? ""} className="min-h-11" aria-invalid={!!err("name")} />
                {err("name") && <p className="text-xs text-destructive">{err("name")}</p>}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="u-email">{t("form.email")}</Label>
                <Input id="u-email" name="email" type="email" dir="ltr" required defaultValue={user?.email ?? ""} className="min-h-11" aria-invalid={!!err("email")} />
                {err("email") && <p className="text-xs text-destructive">{err("email")}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-phone">
                  {t("form.phone")} <span className="text-muted-foreground">({tc("optional")})</span>
                </Label>
                <Input id="u-phone" name="phone" type="tel" dir="ltr" defaultValue={user?.phone ?? ""} className="min-h-11" aria-invalid={!!err("phone")} />
                {err("phone") && <p className="text-xs text-destructive">{err("phone")}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-title">
                  {t("form.title")} <span className="text-muted-foreground">({tc("optional")})</span>
                </Label>
                <Input id="u-title" name="title" defaultValue={user?.profile?.title ?? ""} className="min-h-11" />
              </div>

              {!isEdit && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="u-aid">{t("form.academicId")}</Label>
                    <Input id="u-aid" name="academicId" dir="ltr" placeholder={t("form.academicIdHint")} className="min-h-11" aria-invalid={!!err("academicId")} />
                    {err("academicId") ? <p className="text-xs text-destructive">{err("academicId")}</p> : <p className="text-xs text-muted-foreground">{t("form.academicIdHint")}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="u-pw">{t("form.password")}</Label>
                    <div className="relative">
                      <Input id="u-pw" name="password" type={showPw ? "text" : "password"} dir="ltr" autoComplete="new-password" className="min-h-11 pe-11" aria-invalid={!!err("password")} />
                      <Button type="button" variant="ghost" size="icon" className="absolute end-1 top-1/2 -translate-y-1/2" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "hide" : "show"}>
                        {showPw ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                      </Button>
                    </div>
                    {err("password") ? <p className="text-xs text-destructive">{err("password")}</p> : <p className="text-xs text-muted-foreground">{t("form.passwordHint")}</p>}
                  </div>

                  <fieldset className="space-y-2 sm:col-span-2">
                    <legend className="text-sm font-medium">{t("form.roles")}</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {roles.map((r) => (
                        <label key={r.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-accent/40">
                          <Checkbox name="roleIds" value={r.id} defaultChecked={r.code === "STUDENT"} />
                          <span>{r.name}</span>
                          <span className="ms-auto font-mono text-xs text-muted-foreground">{r.code}</span>
                        </label>
                      ))}
                    </div>
                    {err("roleIds") && <p className="text-xs text-destructive">{err("roleIds")}</p>}
                  </fieldset>

                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <Checkbox name="statusActive" defaultChecked /> {t("form.statusActive")}
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <Checkbox name="mustChange" defaultChecked /> {t("form.mustChange")}
                  </label>
                </>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="min-h-11">
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={pending} className="min-h-11 gap-2">
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {tc("save")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
