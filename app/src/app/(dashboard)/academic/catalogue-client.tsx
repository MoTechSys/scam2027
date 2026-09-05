"use client";

/**
 * Catalogue tabs — colleges / departments / majors / levels. One generic list with a parent filter (college → department
 * → major), desktop DataTable + mobile card list, row menu (edit / activate / delete) and the create / generate dialogs.
 */
import { Layers, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { MobileDataTable, type MobileAction, type MobileColumn } from "@/components/ui/mobile-data-table";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteCollegeAction, deleteDepartmentAction, deleteLevelAction, deleteMajorAction } from "@/features/academic/actions";
import type { CollegeRow, DepartmentRow, LevelRow, MajorRow, Option } from "@/features/academic/queries";
import type { CatalogueListQuery } from "@/features/academic/schemas";
import type { Result } from "@/lib/result";
import type { AcademicCan, TabData } from "./academic-client";
import { CollegeDialog, DepartmentDialog, GenerateLevelsDialog, LevelDialog, MajorDialog } from "./dialogs";

type CatalogueData = Exclude<TabData, { tab: "years" }>;
type Row = CollegeRow | DepartmentRow | MajorRow | LevelRow;

type Props = { data: CatalogueData; options: Option[]; query: CatalogueListQuery; can: AcademicCan; onFilter: (parentId: string | undefined) => void };

const ALL = "__all__";

function ActiveBadge({ active }: { active: boolean }) {
  const t = useTranslations("academic.active");
  return <Badge variant={active ? "default" : "outline"}>{t(active ? "true" : "false")}</Badge>;
}

export function CatalogueClient({ data, options, query, can, onFilter }: Props) {
  const t = useTranslations("academic");
  const tc = useTranslations("common");
  const f = useFormatter();
  const [form, setForm] = useState<Row | null | undefined>(undefined); // undefined=closed, null=create
  const [generate, setGenerate] = useState(false);
  const [confirm, setConfirm] = useState<Row | null>(null);

  const tab = data.tab;
  const canManage = { colleges: can.college, departments: can.department, majors: can.major, levels: can.level }[tab];
  const parentLabel = { colleges: null, departments: t("columns.college"), majors: t("columns.department"), levels: t("columns.major") }[tab];
  const createLabel = { colleges: t("actions.createCollege"), departments: t("actions.createDepartment"), majors: t("actions.createMajor"), levels: t("actions.createLevel") }[tab];

  const groups = useMemo(() => {
    const m = new Map<string, Option[]>();
    for (const o of options) {
      const g = o.group ?? "";
      m.set(g, [...(m.get(g) ?? []), o]);
    }
    return [...m.entries()];
  }, [options]);

  const deleteFor = (r: Row): (() => Promise<Result<unknown>>) => {
    switch (tab) {
      case "colleges":
        return () => deleteCollegeAction({ id: r.id });
      case "departments":
        return () => deleteDepartmentAction({ id: r.id });
      case "majors":
        return () => deleteMajorAction({ id: r.id });
      case "levels":
        return () => deleteLevelAction({ id: r.id });
    }
  };

  const menu = (r: Row) => {
    if (!canManage) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`${tc("actions")}: ${r.name}`} className="size-9">
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setForm(r)} className="min-h-10 gap-2">
            <Pencil className="size-4" aria-hidden /> {t("actions.edit")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setConfirm(r)} variant="destructive" className="min-h-10 gap-2">
            <Trash2 className="size-4" aria-hidden /> {t("actions.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const nameCell = (r: Row) => (
    <div className="flex min-w-0 flex-col">
      <span className="font-medium">{r.name}</span>
      {r.nameEn && <span dir="ltr" className="truncate text-start text-xs text-muted-foreground">{r.nameEn}</span>}
    </div>
  );
  const codeCell = (r: Row) => (
    <span dir="ltr" className="font-mono text-xs">
      {"code" in r ? r.code : r.number}
    </span>
  );
  const num = (n: number) => <span className="tabular-nums">{n}</span>;
  const updated = (r: Row) => <span className="text-xs text-muted-foreground">{f.relativeTime(r.updatedAt)}</span>;
  const actionsCol = { key: "id" as const, header: tc("actions"), className: "w-12 text-end", render: menu };

  // Per-tab column sets. Casting is confined here; each branch only reads fields that exist on its row type.
  const columns = useMemo((): Column<Row>[] => {
    const common: Column<Row>[] = [
      { key: "name", header: t("columns.name"), render: nameCell, className: "max-w-xs" },
      { key: "id", header: tab === "levels" ? t("columns.number") : t("columns.code"), render: codeCell },
    ];
    const tail: Column<Row>[] = [
      { key: "isActive", header: t("columns.isActive"), render: (r) => <ActiveBadge active={r.isActive} /> },
      { key: "updatedAt", header: t("columns.updatedAt"), render: updated },
      actionsCol,
    ];
    switch (tab) {
      case "colleges":
        return [...common, { key: "id", header: t("columns.departments"), render: (r) => num((r as CollegeRow).departmentCount) }, ...tail];
      case "departments":
        return [
          ...common,
          { key: "id", header: t("columns.college"), render: (r) => (r as DepartmentRow).collegeName },
          { key: "id", header: t("columns.majors"), render: (r) => num((r as DepartmentRow).majorCount) },
          { key: "id", header: t("columns.courses"), render: (r) => num((r as DepartmentRow).courseCount) },
          ...tail,
        ];
      case "majors":
        return [
          ...common,
          { key: "id", header: t("columns.department"), render: (r) => `${(r as MajorRow).departmentName} · ${(r as MajorRow).collegeName}` },
          { key: "id", header: t("columns.degree"), render: (r) => <Badge variant="secondary">{t(`degree.${(r as MajorRow).degree}`)}</Badge> },
          { key: "id", header: t("columns.duration"), render: (r) => ((r as MajorRow).durationYears ? t("durationYears", { count: (r as MajorRow).durationYears as number }) : "—") },
          { key: "id", header: t("columns.levels"), render: (r) => num((r as MajorRow).levelCount) },
          { key: "id", header: t("columns.courses"), render: (r) => num((r as MajorRow).courseCount) },
          ...tail,
        ];
      case "levels":
        return [...common, { key: "id", header: t("columns.major"), render: (r) => (r as LevelRow).majorName }, { key: "id", header: t("columns.courses"), render: (r) => num((r as LevelRow).courseCount) }, ...tail];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, t, tc, f, canManage]);

  const mobileColumns: MobileColumn<Row>[] = [
    { key: "name", header: t("columns.name"), primary: true, render: nameCell },
    { key: "id", header: tab === "levels" ? t("columns.number") : t("columns.code"), secondary: true, render: codeCell },
    { key: "isActive", header: t("columns.isActive"), badge: true, render: (r) => <ActiveBadge active={r.isActive} /> },
    ...columns.filter((c) => !["name", "isActive", "updatedAt"].includes(c.key) && c !== actionsCol && c.render !== codeCell).map((c) => ({ ...c, className: undefined })),
  ];
  const mobileActions: MobileAction<Row>[] = canManage
    ? [
        { label: t("actions.edit"), onClick: (r) => setForm(r) },
        { label: t("actions.delete"), variant: "destructive", onClick: (r) => setConfirm(r) },
      ]
    : [];

  const rows = data.rows as Row[];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        {parentLabel ? (
          <div className="space-y-1.5 sm:w-72">
            <Label htmlFor="parent-filter">{parentLabel}</Label>
            <Select value={query.parentId ?? ALL} onValueChange={(v) => onFilter(v === ALL ? undefined : v)}>
              <SelectTrigger id="parent-filter" className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{tc("all")}</SelectItem>
                {groups.map(([g, opts]) => (
                  <SelectGroup key={g || "_"}>
                    {g && <SelectLabel>{g}</SelectLabel>}
                    {opts.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <span />
        )}
        {canManage && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => setForm(null)} className="min-h-11 gap-2" data-testid={`create-${tab}`} disabled={tab !== "colleges" && options.length === 0}>
              <Plus className="size-4" aria-hidden /> {createLabel}
            </Button>
            {tab === "levels" && (
              <Button variant="outline" onClick={() => setGenerate(true)} className="min-h-11 gap-2" data-testid="generate-levels" disabled={options.length === 0}>
                <Layers className="size-4" aria-hidden /> {t("actions.generateLevels")}
              </Button>
            )}
          </div>
        )}
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("total", { count: rows.length })}
      </p>

      <div className="hidden md:block">
        <DataTable columns={columns} data={rows} keyExtractor={(r) => r.id} emptyMessage={t("empty")} maxHeight="none" />
      </div>
      <div className="md:hidden">
        <MobileDataTable columns={mobileColumns} data={rows} keyExtractor={(r) => r.id} emptyMessage={t("empty")} actionsLabel={tc("actions")} actions={mobileActions} />
      </div>

      {tab === "colleges" && <CollegeDialog open={form !== undefined} onOpenChange={(o) => !o && setForm(undefined)} college={(form as CollegeRow | null | undefined) ?? null} />}
      {tab === "departments" && <DepartmentDialog open={form !== undefined} onOpenChange={(o) => !o && setForm(undefined)} department={(form as DepartmentRow | null | undefined) ?? null} colleges={options} />}
      {tab === "majors" && <MajorDialog open={form !== undefined} onOpenChange={(o) => !o && setForm(undefined)} major={(form as MajorRow | null | undefined) ?? null} departments={options} />}
      {tab === "levels" && (
        <>
          <LevelDialog open={form !== undefined} onOpenChange={(o) => !o && setForm(undefined)} level={(form as LevelRow | null | undefined) ?? null} majors={options} defaultMajorId={query.parentId} />
          {generate && <GenerateLevelsDialog open onOpenChange={(o) => !o && setGenerate(false)} majors={options} defaultMajorId={query.parentId} />}
        </>
      )}
      {confirm && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title={`${t("actions.delete")}: ${confirm.name}`}
          body={tab === "majors" ? t("confirm.deleteMajor") : t("confirm.delete")}
          destructive
          onConfirm={deleteFor(confirm)}
        />
      )}
    </div>
  );
}
