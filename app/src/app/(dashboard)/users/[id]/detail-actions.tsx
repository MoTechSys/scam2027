"use client";

import { KeyRound, Pencil, RotateCcw, Shield, Snowflake, Trash2, UserCheck, UserX, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { restoreUserAction, revokeUserSessionsAction, setUserStatusAction, softDeleteUserAction } from "@/features/users/actions";
import type { RoleOption, UserDetail } from "@/features/users/queries";
import { AssignRolesDialog, ConfirmDialog, ResetPasswordDialog } from "../user-dialogs";
import { UserFormDialog } from "../user-form-dialog";

type Can = { edit: boolean; delete: boolean; restore: boolean; activate: boolean; freeze: boolean; resetPassword: boolean; changeRole: boolean };
type Confirm = "delete" | "freeze" | "disable" | "revokeSessions" | null;

export function DetailActions({ user, roles, self, can }: { user: UserDetail; roles: RoleOption[]; self: boolean; can: Can }) {
  const t = useTranslations("users");
  const router = useRouter();
  const [, start] = useTransition();
  const [edit, setEdit] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [reset, setReset] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const deleted = !!user.deletedAt;

  const simple = (fn: () => Promise<{ ok: boolean; message?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.message ?? "");
      else {
        toast.success(ok);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-wrap gap-2">
      {deleted ? (
        can.restore && (
          <Button variant="outline" className="min-h-11 gap-2" onClick={() => simple(() => restoreUserAction({ id: user.id }), t("toast.restored"))}>
            <RotateCcw className="size-4" aria-hidden /> {t("actions.restore")}
          </Button>
        )
      ) : (
        <>
          {can.edit && (
            <Button variant="outline" className="min-h-11 gap-2" onClick={() => setEdit(true)}>
              <Pencil className="size-4" aria-hidden /> {t("actions.edit")}
            </Button>
          )}
          {can.changeRole && !self && (
            <Button variant="outline" className="min-h-11 gap-2" onClick={() => setRolesOpen(true)}>
              <Shield className="size-4" aria-hidden /> {t("actions.assignRoles")}
            </Button>
          )}
          {can.resetPassword && (
            <Button variant="outline" className="min-h-11 gap-2" onClick={() => setReset(true)}>
              <KeyRound className="size-4" aria-hidden /> {t("actions.resetPassword")}
            </Button>
          )}
          {!self && can.activate && user.status !== "ACTIVE" && (
            <Button variant="outline" className="min-h-11 gap-2" onClick={() => simple(() => setUserStatusAction({ id: user.id, status: "ACTIVE" }), t("toast.statusChanged"))}>
              <UserCheck className="size-4" aria-hidden /> {t("actions.activate")}
            </Button>
          )}
          {!self && can.freeze && user.status === "ACTIVE" && (
            <Button variant="outline" className="min-h-11 gap-2" onClick={() => setConfirm("freeze")}>
              <Snowflake className="size-4" aria-hidden /> {t("actions.freeze")}
            </Button>
          )}
          {!self && can.activate && user.status !== "DISABLED" && (
            <Button variant="outline" className="min-h-11 gap-2" onClick={() => setConfirm("disable")}>
              <UserX className="size-4" aria-hidden /> {t("actions.disable")}
            </Button>
          )}
          {!self && (can.freeze || can.edit) && user.activeSessions > 0 && (
            <Button variant="outline" className="min-h-11 gap-2" onClick={() => setConfirm("revokeSessions")}>
              <X className="size-4" aria-hidden /> {t("actions.revokeSessions")}
            </Button>
          )}
          {!self && can.delete && (
            <Button variant="destructive" className="min-h-11 gap-2" onClick={() => setConfirm("delete")}>
              <Trash2 className="size-4" aria-hidden /> {t("actions.delete")}
            </Button>
          )}
        </>
      )}

      <UserFormDialog open={edit} onOpenChange={setEdit} roles={roles} user={user} />
      <AssignRolesDialog open={rolesOpen} onOpenChange={setRolesOpen} user={user} roles={roles} />
      <ResetPasswordDialog open={reset} onOpenChange={setReset} user={user} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? t(`actions.${confirm}`) : ""}
        body={confirm ? t(`confirm.${confirm}`) : ""}
        destructive={confirm === "delete" || confirm === "disable"}
        onConfirm={async () => {
          const id = user.id;
          const r =
            confirm === "delete"
              ? await softDeleteUserAction({ id })
              : confirm === "revokeSessions"
                ? await revokeUserSessionsAction({ id })
                : await setUserStatusAction({ id, status: confirm === "freeze" ? "FROZEN" : "DISABLED" });
          if (r.ok) toast.success(t(confirm === "delete" ? "toast.deleted" : confirm === "revokeSessions" ? "toast.sessionsRevoked" : "toast.statusChanged"));
          return r;
        }}
      />
    </div>
  );
}
