"use client";

import { Copy, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { restoreRoleAction, softDeleteRoleAction } from "@/features/roles/actions";
import type { RoleDetail } from "@/features/roles/queries";
import { CloneRoleDialog, RoleFormDialog } from "../role-dialogs";

type Can = { create: boolean; edit: boolean; delete: boolean };

export function RoleDetailActions({ role, grantable, can }: { role: RoleDetail; grantable: string[]; can: Can }) {
  const t = useTranslations("roles");
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [clone, setClone] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "restore" | null>(null);
  const grantableSet = useMemo(() => new Set(grantable), [grantable]);
  const deleted = !!role.deletedAt;

  return (
    <div className="flex flex-wrap gap-2">
      {deleted ? (
        can.delete && (
          <Button variant="outline" className="min-h-11 gap-2" onClick={() => setConfirm("restore")}>
            <RotateCcw className="size-4" aria-hidden /> {t("actions.restore")}
          </Button>
        )
      ) : (
        <>
          {can.create && (
            <Button variant="outline" className="min-h-11 gap-2" onClick={() => setClone(true)}>
              <Copy className="size-4" aria-hidden /> {t("actions.clone")}
            </Button>
          )}
          {!role.isSystem && can.edit && (
            <Button variant="outline" className="min-h-11 gap-2" onClick={() => setEdit(true)}>
              <Pencil className="size-4" aria-hidden /> {t("actions.edit")}
            </Button>
          )}
          {!role.isSystem && can.delete && (
            <Button variant="destructive" className="min-h-11 gap-2" disabled={role.userCount > 0} title={role.userCount > 0 ? t("confirm.delete") : undefined} onClick={() => setConfirm("delete")}>
              <Trash2 className="size-4" aria-hidden /> {t("actions.delete")}
            </Button>
          )}
        </>
      )}

      <RoleFormDialog open={edit} onOpenChange={setEdit} role={role} grantable={grantableSet} />
      <CloneRoleDialog open={clone} onOpenChange={setClone} source={role} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? t(`actions.${confirm}`) : ""}
        body={confirm ? t(`confirm.${confirm}`) : ""}
        destructive={confirm === "delete"}
        onConfirm={async () => {
          const r = confirm === "delete" ? await softDeleteRoleAction({ id: role.id }) : await restoreRoleAction({ id: role.id });
          if (r.ok) {
            toast.success(t(confirm === "delete" ? "toast.deleted" : "toast.restored"));
            if (confirm === "delete") router.push("/roles?tab=DELETED");
          }
          return r;
        }}
      />
    </div>
  );
}
