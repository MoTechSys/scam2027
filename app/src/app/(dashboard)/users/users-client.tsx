"use client";

/**
 * Users list — URL-driven filters (server pagination), desktop DataTable + mobile card list, row action menu.
 */
import { KeyRound, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Shield, Snowflake, Trash2, UserCheck, UserX, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { MobileDataTable } from "@/components/ui/mobile-data-table";
import { PageTabs } from "@/components/ui/page-tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { restoreUserAction, revokeUserSessionsAction, setUserStatusAction, softDeleteUserAction } from "@/features/users/actions";
import type { RoleOption, UserRow } from "@/features/users/queries";
import type { UserListQuery } from "@/features/users/schemas";
import type { Page } from "@/lib/result";
import { UserStatusBadge } from "./status-badge";
import { AssignRolesDialog, ConfirmDialog, ResetPasswordDialog } from "./user-dialogs";
import { UserFormDialog } from "./user-form-dialog";

export type Can = {
  create: boolean;
  edit: boolean;
  delete: boolean;
  restore: boolean;
  activate: boolean;
  freeze: boolean;
  resetPassword: boolean;
  changeRole: boolean;
  viewDetails: boolean;
};

type Props = {
  page: Page<UserRow>;
  query: UserListQuery;
  counts: Record<string, number>;
  roles: RoleOption[];
  selfId: string;
  can: Can;
};

type Confirm = { kind: "delete" | "freeze" | "disable" | "revokeSessions"; user: UserRow } | null;

const TABS = ["ALL", "ACTIVE", "PENDING_ACTIVATION", "FROZEN", "DISABLED", "DELETED"] as const;

export function UsersClient({ page, query, counts, roles, selfId, can }: Props) {
  const t = useTranslations("users");
  const tc = useTranslations("common");
  const f = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, start] = useTransition();

  const [formUser, setFormUser] = useState<UserRow | null | undefined>(undefined); // undefined=closed, null=create
  const [rolesUser, setRolesUser] = useState<UserRow | null>(null);
  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [q, setQ] = useState(query.q);

  const setParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (!v || v === "ALL") next.delete(k);
        else next.set(k, v);
      }
      if (!("page" in patch)) next.delete("page");
      start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`));
    },
    [sp, router, pathname],
  );

  const runSimple = (fn: () => ReturnType<typeof restoreUserAction>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.message);
      else {
        toast.success(ok);
        router.refresh();
      }
    });

  const actionsFor = (u: UserRow) => {
    const self = u.id === selfId;
    const deleted = !!u.deletedAt;
    const items: { key: string; label: string; icon: React.ReactNode; onClick: () => void; destructive?: boolean }[] = [];
    if (deleted) {
      if (can.restore)
        items.push({ key: "restore", label: t("actions.restore"), icon: <RotateCcw className="size-4" aria-hidden />, onClick: () => runSimple(() => restoreUserAction({ id: u.id }), t("toast.restored")) });
      return items;
    }
    if (can.edit) items.push({ key: "edit", label: t("actions.edit"), icon: <Pencil className="size-4" aria-hidden />, onClick: () => setFormUser(u) });
    if (can.changeRole && !self) items.push({ key: "roles", label: t("actions.assignRoles"), icon: <Shield className="size-4" aria-hidden />, onClick: () => setRolesUser(u) });
    if (can.resetPassword) items.push({ key: "reset", label: t("actions.resetPassword"), icon: <KeyRound className="size-4" aria-hidden />, onClick: () => setResetUser(u) });
    if (!self) {
      if (can.activate && u.status !== "ACTIVE")
        items.push({ key: "activate", label: t("actions.activate"), icon: <UserCheck className="size-4" aria-hidden />, onClick: () => runSimple(() => setUserStatusAction({ id: u.id, status: "ACTIVE" }), t("toast.statusChanged")) });
      if (can.freeze && u.status === "ACTIVE") items.push({ key: "freeze", label: t("actions.freeze"), icon: <Snowflake className="size-4" aria-hidden />, onClick: () => setConfirm({ kind: "freeze", user: u }) });
      if (can.activate && u.status !== "DISABLED") items.push({ key: "disable", label: t("actions.disable"), icon: <UserX className="size-4" aria-hidden />, onClick: () => setConfirm({ kind: "disable", user: u }), destructive: true });
      if (can.freeze || can.edit) items.push({ key: "revoke", label: t("actions.revokeSessions"), icon: <X className="size-4" aria-hidden />, onClick: () => setConfirm({ kind: "revokeSessions", user: u }) });
      if (can.delete) items.push({ key: "delete", label: t("actions.delete"), icon: <Trash2 className="size-4" aria-hidden />, onClick: () => setConfirm({ kind: "delete", user: u }), destructive: true });
    }
    return items;
  };

  const nameCell = (u: UserRow) =>
    can.viewDetails ? (
      <Link href={`/users/${u.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
        {u.name}
      </Link>
    ) : (
      <span className="font-medium">{u.name}</span>
    );

  const columns: Column<UserRow>[] = useMemo(
    () => [
      { key: "name", header: t("columns.name"), render: nameCell },
      { key: "academicId", header: t("columns.academicId"), render: (u) => <span dir="ltr" className="font-mono text-xs">{u.academicId}</span> },
      { key: "email", header: t("columns.email"), render: (u) => <span dir="ltr" className="text-xs text-muted-foreground">{u.email}</span> },
      { key: "roles", header: t("columns.roles"), render: (u) => <span className="text-xs">{u.roles.map((r) => r.name).join(" · ") || "—"}</span> },
      { key: "status", header: t("columns.status"), render: (u) => <UserStatusBadge status={u.status} deleted={!!u.deletedAt} /> },
      { key: "lastLoginAt", header: t("columns.lastLogin"), render: (u) => <span className="text-xs text-muted-foreground">{u.lastLoginAt ? f.relativeTime(u.lastLoginAt) : t("never")}</span> },
      {
        key: "id",
        header: tc("actions"),
        className: "w-12 text-end",
        render: (u) => {
          const items = actionsFor(u);
          if (!items.length) return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`${tc("actions")}: ${u.name}`} className="size-9">
                  <MoreHorizontal className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {items.map((it, i) => (
                  <span key={it.key}>
                    {it.destructive && i > 0 && !items[i - 1]?.destructive && <DropdownMenuSeparator />}
                    <DropdownMenuItem onSelect={it.onClick} variant={it.destructive ? "destructive" : "default"} className="min-h-10 gap-2">
                      {it.icon} {it.label}
                    </DropdownMenuItem>
                  </span>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, tc, f, can, selfId],
  );

  const pagination = {
    currentPage: page.page,
    totalPages: page.pageCount,
    onPageChange: (p: number) => setParams({ page: String(p) }),
    labels: { prev: tc("prev"), next: tc("next"), page: (c: number, n: number) => tc("pageOf", { current: c, total: n }) },
  };

  const confirmText = confirm ? t(`confirm.${confirm.kind}`) : "";
  const confirmTitle = confirm ? t(`actions.${confirm.kind === "revokeSessions" ? "revokeSessions" : confirm.kind}`) : "";

  return (
    <div className="space-y-4">
      <PageTabs
        tabs={TABS.map((id) => ({ id, label: t(`tabs.${id}`), badge: counts[id] ?? 0 }))}
        activeTab={query.status}
        onTabChange={(id) => setParams({ status: id })}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          role="search"
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setParams({ q });
          }}
        >
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={tc("search")}
            className="min-h-11 ps-10"
          />
        </form>
        <Select value={query.roleId ?? "ALL"} onValueChange={(v) => setParams({ roleId: v })}>
          <SelectTrigger className="min-h-11 sm:w-56" aria-label={t("roleFilter")}>
            <SelectValue placeholder={t("allRoles")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("allRoles")}</SelectItem>
            {roles.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {can.create && (
          <Button onClick={() => setFormUser(null)} className="min-h-11 gap-2">
            <Plus className="size-4" aria-hidden /> {t("actions.create")}
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("total", { count: page.total })}
      </p>

      <div className="hidden md:block">
        <DataTable columns={columns} data={page.items} keyExtractor={(u) => u.id} emptyMessage={t("empty")} pagination={pagination} maxHeight="none" />
      </div>
      <div className="md:hidden">
        <MobileDataTable
          columns={[
            { key: "name", header: t("columns.name"), primary: true, render: nameCell },
            { key: "email", header: t("columns.email"), secondary: true, render: (u) => <span dir="ltr">{u.email}</span> },
            { key: "status", header: t("columns.status"), badge: true, render: (u) => <UserStatusBadge status={u.status} deleted={!!u.deletedAt} /> },
            { key: "academicId", header: t("columns.academicId"), render: (u) => <span dir="ltr" className="font-mono">{u.academicId}</span> },
            { key: "roles", header: t("columns.roles"), render: (u) => u.roles.map((r) => r.name).join(" · ") || "—" },
          ]}
          data={page.items}
          keyExtractor={(u) => u.id}
          emptyMessage={t("empty")}
          actionsLabel={tc("actions")}
          actions={[
            ...(can.edit ? [{ label: t("actions.edit"), onClick: (u: UserRow) => setFormUser(u) }] : []),
            ...(can.changeRole ? [{ label: t("actions.assignRoles"), onClick: (u: UserRow) => setRolesUser(u) }] : []),
            ...(can.resetPassword ? [{ label: t("actions.resetPassword"), onClick: (u: UserRow) => setResetUser(u) }] : []),
            ...(can.freeze ? [{ label: t("actions.freeze"), onClick: (u: UserRow) => setConfirm({ kind: "freeze", user: u }) }] : []),
            ...(can.delete ? [{ label: t("actions.delete"), variant: "destructive" as const, onClick: (u: UserRow) => setConfirm({ kind: "delete", user: u }) }] : []),
          ]}
          pagination={pagination}
        />
      </div>

      <UserFormDialog open={formUser !== undefined} onOpenChange={(o) => !o && setFormUser(undefined)} roles={roles} user={formUser ?? null} />
      <AssignRolesDialog open={!!rolesUser} onOpenChange={(o) => !o && setRolesUser(null)} user={rolesUser} roles={roles} />
      <ResetPasswordDialog open={!!resetUser} onOpenChange={(o) => !o && setResetUser(null)} user={resetUser} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirmTitle}
        body={confirmText}
        destructive={confirm?.kind === "delete" || confirm?.kind === "disable"}
        onConfirm={async () => {
          if (!confirm) return { ok: true, data: null };
          const id = confirm.user.id;
          const r =
            confirm.kind === "delete"
              ? await softDeleteUserAction({ id })
              : confirm.kind === "revokeSessions"
                ? await revokeUserSessionsAction({ id })
                : await setUserStatusAction({ id, status: confirm.kind === "freeze" ? "FROZEN" : "DISABLED" });
          if (r.ok) toast.success(t(confirm.kind === "delete" ? "toast.deleted" : confirm.kind === "revokeSessions" ? "toast.sessionsRevoked" : "toast.statusChanged"));
          return r;
        }}
      />
    </div>
  );
}
