"use client";

/**
 * Roles list — URL-driven tab/search, desktop DataTable + mobile card list, row action menu.
 * System roles show a lock badge and expose only view/clone (FR-ROL-005).
 */
import { Copy, Lock, MoreHorizontal, Pencil, Plus, RotateCcw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { MobileDataTable } from "@/components/ui/mobile-data-table";
import { PageTabs } from "@/components/ui/page-tabs";
import { restoreRoleAction, softDeleteRoleAction } from "@/features/roles/actions";
import type { RoleRow } from "@/features/roles/queries";
import type { RoleListQuery } from "@/features/roles/schemas";
import { CloneRoleDialog, RoleFormDialog } from "./role-dialogs";

export type RoleCan = { create: boolean; edit: boolean; editPermissions: boolean; delete: boolean; viewPermissions: boolean };

type Props = {
  roles: RoleRow[];
  query: RoleListQuery;
  counts: Record<RoleListQuery["tab"], number>;
  grantable: string[];
  can: RoleCan;
};

const TABS = ["ALL", "SYSTEM", "CUSTOM", "DELETED"] as const;

export function RoleTypeBadge({ role }: { role: Pick<RoleRow, "isSystem" | "deletedAt"> }) {
  const t = useTranslations("roles.type");
  if (role.deletedAt) return <Badge variant="destructive">{t("deleted")}</Badge>;
  if (role.isSystem)
    return (
      <Badge variant="secondary" className="gap-1">
        <Lock className="size-3" aria-hidden /> {t("system")}
      </Badge>
    );
  return <Badge variant="outline">{t("custom")}</Badge>;
}

export function RolesClient({ roles, query, counts, grantable, can }: Props) {
  const t = useTranslations("roles");
  const tc = useTranslations("common");
  const f = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, start] = useTransition();
  const grantableSet = useMemo(() => new Set(grantable), [grantable]);

  const [formRole, setFormRole] = useState<RoleRow | null | undefined>(undefined); // undefined=closed, null=create
  const [cloneSource, setCloneSource] = useState<RoleRow | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "delete" | "restore"; role: RoleRow } | null>(null);
  const [q, setQ] = useState(query.q);

  const setParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (!v || v === "ALL") next.delete(k);
        else next.set(k, v);
      }
      start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`));
    },
    [sp, router, pathname],
  );

  const actionsFor = (r: RoleRow) => {
    const items: { key: string; label: string; icon: React.ReactNode; onClick: () => void; destructive?: boolean }[] = [];
    if (r.deletedAt) {
      if (can.delete) items.push({ key: "restore", label: t("actions.restore"), icon: <RotateCcw className="size-4" aria-hidden />, onClick: () => setConfirm({ kind: "restore", role: r }) });
      return items;
    }
    if (can.viewPermissions) items.push({ key: "view", label: t("actions.editPermissions"), icon: <ShieldCheck className="size-4" aria-hidden />, onClick: () => router.push(`/roles/${r.id}`) });
    if (can.create) items.push({ key: "clone", label: t("actions.clone"), icon: <Copy className="size-4" aria-hidden />, onClick: () => setCloneSource(r) });
    if (!r.isSystem) {
      if (can.edit) items.push({ key: "edit", label: t("actions.edit"), icon: <Pencil className="size-4" aria-hidden />, onClick: () => setFormRole(r) });
      if (can.delete) items.push({ key: "delete", label: t("actions.delete"), icon: <Trash2 className="size-4" aria-hidden />, onClick: () => setConfirm({ kind: "delete", role: r }), destructive: true });
    }
    return items;
  };

  const nameCell = (r: RoleRow) => (
    <div className="flex min-w-0 flex-col">
      <Link href={`/roles/${r.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
        {r.name}
      </Link>
      {r.description && <span className="truncate text-xs text-muted-foreground">{r.description}</span>}
    </div>
  );

  const columns: Column<RoleRow>[] = useMemo(
    () => [
      { key: "name", header: t("columns.name"), render: nameCell, className: "max-w-xs" },
      { key: "code", header: t("columns.code"), render: (r) => <span dir="ltr" className="font-mono text-xs">{r.code}</span> },
      { key: "isSystem", header: t("columns.type"), render: (r) => <RoleTypeBadge role={r} /> },
      { key: "userCount", header: t("columns.users"), render: (r) => <span className="tabular-nums">{r.userCount}</span> },
      { key: "permissionCount", header: t("columns.permissions"), render: (r) => <span className="tabular-nums text-xs">{t("permissionsOf", { count: r.permissionCount, total: r.permissionTotal })}</span> },
      { key: "updatedAt", header: t("columns.updatedAt"), render: (r) => <span className="text-xs text-muted-foreground">{f.relativeTime(r.updatedAt)}</span> },
      {
        key: "id",
        header: tc("actions"),
        className: "w-12 text-end",
        render: (r) => {
          const items = actionsFor(r);
          if (!items.length) return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`${tc("actions")}: ${r.name}`} className="size-9">
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
    [t, tc, f, can],
  );

  return (
    <div className="space-y-4">
      <PageTabs tabs={TABS.map((id) => ({ id, label: t(`tabs.${id}`), badge: counts[id] ?? 0 }))} activeTab={query.tab} onTabChange={(id) => setParams({ tab: id })} />

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
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} aria-label={tc("search")} className="min-h-11 ps-10" />
        </form>
        {can.create && (
          <Button onClick={() => setFormRole(null)} className="min-h-11 gap-2">
            <Plus className="size-4" aria-hidden /> {t("actions.create")}
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("total", { count: roles.length })}
        {query.tab !== "DELETED" && <span className="ms-2 hidden sm:inline">· {t("systemHint")}</span>}
      </p>

      <div className="hidden md:block">
        <DataTable columns={columns} data={roles} keyExtractor={(r) => r.id} emptyMessage={t("empty")} maxHeight="none" />
      </div>
      <div className="md:hidden">
        <MobileDataTable
          columns={[
            { key: "name", header: t("columns.name"), primary: true, render: nameCell },
            { key: "code", header: t("columns.code"), secondary: true, render: (r) => <span dir="ltr" className="font-mono">{r.code}</span> },
            { key: "isSystem", header: t("columns.type"), badge: true, render: (r) => <RoleTypeBadge role={r} /> },
            { key: "userCount", header: t("columns.users"), render: (r) => t("usersCount", { count: r.userCount }) },
            { key: "permissionCount", header: t("columns.permissions"), render: (r) => t("permissionsOf", { count: r.permissionCount, total: r.permissionTotal }) },
          ]}
          data={roles}
          keyExtractor={(r) => r.id}
          emptyMessage={t("empty")}
          actionsLabel={tc("actions")}
          actions={[
            ...(can.viewPermissions ? [{ label: t("actions.editPermissions"), onClick: (r: RoleRow) => router.push(`/roles/${r.id}`) }] : []),
            ...(can.create ? [{ label: t("actions.clone"), onClick: (r: RoleRow) => setCloneSource(r) }] : []),
            ...(can.edit ? [{ label: t("actions.edit"), onClick: (r: RoleRow) => (r.isSystem ? toast.info(t("systemHint")) : setFormRole(r)) }] : []),
            ...(can.delete
              ? [{ label: t("actions.delete"), variant: "destructive" as const, onClick: (r: RoleRow) => (r.isSystem ? toast.info(t("systemHint")) : setConfirm({ kind: r.deletedAt ? "restore" : "delete", role: r })) }]
              : []),
          ]}
        />
      </div>

      <RoleFormDialog open={formRole !== undefined} onOpenChange={(o) => !o && setFormRole(undefined)} role={formRole ?? null} grantable={grantableSet} />
      <CloneRoleDialog open={!!cloneSource} onOpenChange={(o) => !o && setCloneSource(null)} source={cloneSource} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? t(`actions.${confirm.kind}`) : ""}
        body={confirm ? t(`confirm.${confirm.kind}`) : ""}
        destructive={confirm?.kind === "delete"}
        onConfirm={async () => {
          if (!confirm) return { ok: true, data: null };
          const r = confirm.kind === "delete" ? await softDeleteRoleAction({ id: confirm.role.id }) : await restoreRoleAction({ id: confirm.role.id });
          if (r.ok) toast.success(t(confirm.kind === "delete" ? "toast.deleted" : "toast.restored"));
          return r;
        }}
      />
    </div>
  );
}
