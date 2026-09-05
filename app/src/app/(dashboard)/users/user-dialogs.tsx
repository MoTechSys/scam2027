"use client";

/** Small dialogs: assign roles, reset password (with one-time reveal), generic confirm. */
import { Check, Copy, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assignRolesAction, resetPasswordAction } from "@/features/users/actions";
import type { RoleOption, UserRow } from "@/features/users/queries";
import type { Result } from "@/lib/result";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  body: string;
  destructive?: boolean;
  onConfirm: () => Promise<Result<unknown>>;
}) {
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? "min-h-11 bg-destructive text-white hover:bg-destructive/90" : "min-h-11"}
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await onConfirm();
                if (!r.ok) toast.error(r.message);
                else {
                  onOpenChange(false);
                  router.refresh();
                }
              });
            }}
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AssignRolesDialog({
  open,
  onOpenChange,
  user,
  roles,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  user: UserRow | null;
  roles: RoleOption[];
}) {
  const t = useTranslations("users");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  const current = new Set(user.roles.map((r) => r.id));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const roleIds = new FormData(e.currentTarget).getAll("roleIds").map(String);
            start(async () => {
              const r = await assignRolesAction({ id: user.id, roleIds });
              if (!r.ok) {
                setError(r.fieldErrors?.roleIds?.[0] ?? r.message);
                toast.error(r.message);
                return;
              }
              toast.success(t("toast.rolesUpdated"));
              onOpenChange(false);
              router.refresh();
            });
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>{t("rolesTitle")}</DialogTitle>
            <DialogDescription>
              {user.name} · <span className="font-mono">{user.academicId}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {roles.map((r) => (
              <label key={r.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-accent/40">
                <Checkbox name="roleIds" value={r.id} defaultChecked={current.has(r.id)} />
                <span>{r.name}</span>
                <span className="ms-auto font-mono text-xs text-muted-foreground">{r.code}</span>
              </label>
            ))}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
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

export function ResetPasswordDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  user: UserRow | null;
}) {
  const t = useTranslations("users");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [temp, setTemp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  if (!user) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setTemp(null);
          setError(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        {temp ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("tempPasswordTitle")}</DialogTitle>
              <DialogDescription>{t("tempPasswordBody")}</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <code dir="ltr" className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-base select-all">
                {temp}
              </code>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-2"
                onClick={async () => {
                  await navigator.clipboard.writeText(temp);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? t("copied") : t("copy")}
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" className="min-h-11" onClick={() => onOpenChange(false)}>
                {tc("close")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const password = String(new FormData(e.currentTarget).get("password") ?? "");
              start(async () => {
                const r = await resetPasswordAction({ id: user.id, password });
                if (!r.ok) {
                  setError(r.fieldErrors?.password?.[0] ?? r.message);
                  toast.error(r.message);
                  return;
                }
                toast.success(t("toast.passwordReset"));
                if (r.data.tempPassword) setTemp(r.data.tempPassword);
                else onOpenChange(false);
                router.refresh();
              });
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>{t("resetTitle")}</DialogTitle>
              <DialogDescription>{t("resetHint")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="rp-pw">{t("form.password")}</Label>
              <Input id="rp-pw" name="password" type="text" dir="ltr" autoComplete="off" placeholder={t("form.passwordHint")} className="min-h-11 font-mono" aria-invalid={!!error} />
              {error ? <p className="text-xs text-destructive">{error}</p> : <p className="text-xs text-muted-foreground">{t("form.passwordHint")}</p>}
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={pending} className="min-h-11 gap-2">
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {t("actions.resetPassword")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
