"use client";

/**
 * Years & semesters — one card per academic year with its semesters as rows (desktop table / mobile list).
 * Set-current is a single action that keeps year+semester coherent (FR-ACD-003).
 */
import { CalendarDays, CalendarPlus, MoreHorizontal, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { deleteSemesterAction, deleteYearAction, setCurrentSemesterAction, setCurrentYearAction } from "@/features/academic/actions";
import type { Option, SemesterRow, YearRow } from "@/features/academic/queries";
import type { AcademicCan } from "./academic-client";
import { SemesterDialog, YearDialog } from "./dialogs";

type Props = { years: YearRow[]; yearOptions: Option[]; can: AcademicCan };

type Confirm =
  | { kind: "deleteYear"; year: YearRow }
  | { kind: "deleteSemester"; semester: SemesterRow }
  | { kind: "currentYear"; year: YearRow }
  | { kind: "currentSemester"; semester: SemesterRow };

function MenuItems({ items }: { items: { key: string; label: string; icon: React.ReactNode; onClick: () => void; destructive?: boolean }[] }) {
  return (
    <>
      {items.map((it, i) => (
        <span key={it.key}>
          {it.destructive && i > 0 && !items[i - 1]?.destructive && <DropdownMenuSeparator />}
          <DropdownMenuItem onSelect={it.onClick} variant={it.destructive ? "destructive" : "default"} className="min-h-10 gap-2">
            {it.icon} {it.label}
          </DropdownMenuItem>
        </span>
      ))}
    </>
  );
}

export function YearsClient({ years, yearOptions, can }: Props) {
  const t = useTranslations("academic");
  const tc = useTranslations("common");
  const f = useFormatter();
  const [yearDialog, setYearDialog] = useState<YearRow | null | undefined>(undefined); // undefined=closed, null=create
  const [semDialog, setSemDialog] = useState<{ semester: SemesterRow | null; yearId?: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const date = (d: Date) => f.dateTime(d, { dateStyle: "medium" });

  const yearMenu = (y: YearRow) => {
    const items: React.ComponentProps<typeof MenuItems>["items"] = [];
    if (can.setCurrent && !y.isCurrent) items.push({ key: "current", label: t("actions.setCurrent"), icon: <Star className="size-4" aria-hidden />, onClick: () => setConfirm({ kind: "currentYear", year: y }) });
    if (can.semester) {
      items.push({ key: "addSem", label: t("actions.createSemester"), icon: <CalendarPlus className="size-4" aria-hidden />, onClick: () => setSemDialog({ semester: null, yearId: y.id }) });
      items.push({ key: "edit", label: t("actions.edit"), icon: <Pencil className="size-4" aria-hidden />, onClick: () => setYearDialog(y) });
      if (y.semesters.length === 0) items.push({ key: "delete", label: t("actions.delete"), icon: <Trash2 className="size-4" aria-hidden />, onClick: () => setConfirm({ kind: "deleteYear", year: y }), destructive: true });
    }
    return items;
  };
  const semMenu = (s: SemesterRow) => {
    const items: React.ComponentProps<typeof MenuItems>["items"] = [];
    if (can.setCurrent && !s.isCurrent) items.push({ key: "current", label: t("actions.setCurrent"), icon: <Star className="size-4" aria-hidden />, onClick: () => setConfirm({ kind: "currentSemester", semester: s }) });
    if (can.semester) {
      items.push({ key: "edit", label: t("actions.edit"), icon: <Pencil className="size-4" aria-hidden />, onClick: () => setSemDialog({ semester: s }) });
      if (!s.isCurrent && s.offeringCount === 0) items.push({ key: "delete", label: t("actions.delete"), icon: <Trash2 className="size-4" aria-hidden />, onClick: () => setConfirm({ kind: "deleteSemester", semester: s }), destructive: true });
    }
    return items;
  };

  const confirmProps = (c: Confirm) => {
    switch (c.kind) {
      case "deleteYear":
        return { title: `${t("actions.delete")}: ${c.year.name}`, body: t("confirm.delete"), destructive: true, run: () => deleteYearAction({ id: c.year.id }) };
      case "deleteSemester":
        return { title: `${t("actions.delete")}: ${c.semester.name}`, body: t("confirm.delete"), destructive: true, run: () => deleteSemesterAction({ id: c.semester.id }) };
      case "currentYear":
        return { title: `${t("actions.setCurrent")}: ${c.year.name}`, body: t("confirm.setCurrentYear"), destructive: false, run: () => setCurrentYearAction({ id: c.year.id }) };
      case "currentSemester":
        return { title: `${t("actions.setCurrent")}: ${c.semester.name}`, body: t("confirm.setCurrentSemester"), destructive: false, run: () => setCurrentSemesterAction({ id: c.semester.id }) };
    }
  };
  const cp = confirm ? confirmProps(confirm) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("total", { count: years.length })}
        </p>
        {can.semester && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => setYearDialog(null)} className="min-h-11 gap-2" data-testid="create-year">
              <Plus className="size-4" aria-hidden /> {t("actions.createYear")}
            </Button>
            {years.length > 0 && (
              <Button variant="outline" onClick={() => setSemDialog({ semester: null, yearId: years.find((y) => y.isCurrent)?.id ?? years[0]?.id })} className="min-h-11 gap-2" data-testid="create-semester">
                <CalendarPlus className="size-4" aria-hidden /> {t("actions.createSemester")}
              </Button>
            )}
          </div>
        )}
      </div>

      {years.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarDays aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t("empty")}</EmptyTitle>
            <EmptyDescription>{t("subtitle")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        years.map((y) => {
          const items = yearMenu(y);
          return (
            <Card key={y.id} data-testid="year-card" className={y.isCurrent ? "border-primary/60" : undefined}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-semibold">{y.name}</h2>
                    <span dir="ltr" className="font-mono text-xs text-muted-foreground">{y.code}</span>
                    {y.isCurrent && (
                      <Badge className="gap-1">
                        <Star className="size-3" aria-hidden /> {t("current.badge")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                    {date(y.startDate)} → {date(y.endDate)}
                  </p>
                </div>
                {items.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`${tc("actions")}: ${y.name}`} className="size-9 shrink-0">
                        <MoreHorizontal className="size-4" aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <MenuItems items={items} />
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                {y.semesters.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">{t("empty")}</p>
                ) : (
                  <ul className="divide-y rounded-md border" aria-label={t("columns.semesters")}>
                    {y.semesters.map((s) => {
                      const sItems = semMenu(s);
                      return (
                        <li key={s.id} data-testid="semester-row" className="flex items-start justify-between gap-3 p-3">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{s.name}</span>
                              <Badge variant="secondary">{t(`term.${s.term}`)}</Badge>
                              <Badge variant={s.status === "ACTIVE" ? "default" : "outline"}>{t(`status.${s.status}`)}</Badge>
                              {s.isCurrent && (
                                <Badge className="gap-1">
                                  <Star className="size-3" aria-hidden /> {t("current.badge")}
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span className="tabular-nums" dir="ltr">
                                {date(s.startDate)} → {date(s.endDate)}
                              </span>
                              {s.registrationOpensAt && s.registrationClosesAt && (
                                <span>
                                  {t("columns.registration")}: <span className="tabular-nums" dir="ltr">{date(s.registrationOpensAt)} → {date(s.registrationClosesAt)}</span>
                                </span>
                              )}
                              <span>
                                {t("columns.offerings")}: <span className="tabular-nums">{s.offeringCount}</span>
                              </span>
                            </div>
                          </div>
                          {sItems.length > 0 && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label={`${tc("actions")}: ${s.name}`} className="size-9 shrink-0">
                                  <MoreHorizontal className="size-4" aria-hidden />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <MenuItems items={sItems} />
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      <YearDialog open={yearDialog !== undefined} onOpenChange={(o) => !o && setYearDialog(undefined)} year={yearDialog ?? null} />
      {semDialog && <SemesterDialog open onOpenChange={(o) => !o && setSemDialog(null)} semester={semDialog.semester} years={yearOptions} defaultYearId={semDialog.yearId} />}
      {cp && <ConfirmDialog open onOpenChange={(o) => !o && setConfirm(null)} title={cp.title} body={cp.body} destructive={cp.destructive} onConfirm={cp.run} />}
    </div>
  );
}
