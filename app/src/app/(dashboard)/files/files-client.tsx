"use client";

/**
 * Files library — tabs (all / mine / trash), search + category / classification / course filters, desktop table +
 * mobile list, row actions (download via signed link, edit, trash, restore, purge) and dialogs (P1-06).
 */
import {
  Download,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { MobileDataTable } from "@/components/ui/mobile-data-table";
import { PageTabs } from "@/components/ui/page-tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  deleteFileAction,
  purgeFilesAction,
  restoreFileAction,
  signedDownloadAction,
} from "@/features/files/actions";
import type { FileRow } from "@/features/files/queries";
import {
  DATA_CLASSIFICATIONS,
  FILE_CATEGORIES,
  FILE_TABS,
  type DataClassification,
  type FileListQuery,
  type FileTab,
} from "@/features/files/schemas";
import type { Page } from "@/lib/result";
import { formatBytes } from "@/lib/storage/validate";
import { EditFileDialog, UploadDialog, type FileLookups } from "./file-dialogs";

export type Can = { upload: boolean; edit: boolean; delete: boolean; download: boolean; admin: boolean };
type Props = {
  page: Page<FileRow>;
  query: FileListQuery;
  counts: Record<FileTab, number>;
  usage: { usedBytes: number; capBytes: number };
  lookups: FileLookups;
  maxUploadBytes: number;
  can: Can;
  openUpload: boolean;
};

const CLASS_STYLE: Record<DataClassification, string> = {
  PUBLIC: "border-transparent bg-primary/15 text-primary",
  INTERNAL: "border-transparent bg-muted text-muted-foreground",
  CONFIDENTIAL: "border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400",
  RESTRICTED: "border-transparent bg-destructive/15 text-destructive",
};

export function ClassificationBadge({ value }: { value: DataClassification }) {
  const t = useTranslations("files.classification");
  return (
    <Badge variant="outline" className={CLASS_STYLE[value]} data-testid="file-classification">
      {t(value)}
    </Badge>
  );
}

function iconFor(mime: string): LucideIcon {
  if (mime.startsWith("image/")) return FileImage;
  if (mime.startsWith("video/")) return FileVideo;
  if (mime.includes("zip")) return FileArchive;
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv") return FileSpreadsheet;
  return FileText;
}

/** Fetch a signed link and navigate to it (browser handles `attachment`). */
async function download(id: string, onError: (m: string) => void) {
  const r = await signedDownloadAction({ id });
  if (!r.ok) return onError(r.message);
  const a = document.createElement("a");
  a.href = r.data.url;
  a.rel = "noopener";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function FilesClient({ page, query, counts, usage, lookups, maxUploadBytes, can, openUpload }: Props) {
  const t = useTranslations("files");
  const tc = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, start] = useTransition();
  const [upload, setUpload] = useState(openUpload);
  const [edit, setEdit] = useState<FileRow | null>(null);
  const [del, setDel] = useState<FileRow | null>(null);
  const [purge, setPurge] = useState<FileRow | null>(null);
  const [emptyTrash, setEmptyTrash] = useState(false);
  const [q, setQ] = useState(query.q);
  const trash = query.tab === "TRASH";

  const setParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(sp.toString());
      next.delete("new");
      for (const [k, v] of Object.entries(patch)) {
        if (!v || v === "ALL") next.delete(k);
        else next.set(k, v);
      }
      if (!("page" in patch)) next.delete("page");
      start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`));
    },
    [sp, router, pathname],
  );

  const mayMutate = (f: FileRow) => can.admin || f.isOwner;
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }), []);

  const nameCell = (f: FileRow) => {
    const Icon = iconFor(f.mimeType);
    return (
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex min-w-0 flex-col">
          <button
            type="button"
            className="truncate text-start font-medium text-foreground hover:text-primary hover:underline disabled:no-underline disabled:opacity-70"
            data-testid="file-link"
            title={f.name}
            disabled={!can.download || trash}
            onClick={() => download(f.id, (m) => toast.error(m))}
          >
            {f.name}
          </button>
          <span className="truncate text-xs text-muted-foreground">
            {t(`category.${f.category}`)} · {f.uploaderName}
          </span>
        </div>
      </div>
    );
  };
  const courseCell = (f: FileRow) =>
    f.courseCode ? (
      <span className="text-xs">
        <span dir="ltr" className="font-mono">
          {f.courseCode}
        </span>
        {f.offeringSection ? ` · ${t("sectionLabel", { section: f.offeringSection })}` : ""}
      </span>
    ) : (
      <span className="text-xs text-muted-foreground">{t("unattached")}</span>
    );
  const sizeCell = (f: FileRow) => (
    <span className="tabular-nums" dir="ltr">
      {formatBytes(f.size)}
    </span>
  );
  const dateCell = (f: FileRow) => (
    <span className="text-xs tabular-nums" dir="ltr">
      {dateFmt.format(new Date(trash && f.deletedAt ? f.deletedAt : f.createdAt))}
    </span>
  );

  const actionsFor = (f: FileRow) => {
    const items: {
      key: string;
      label: string;
      icon: React.ReactNode;
      onClick: () => void;
      destructive?: boolean;
    }[] = [];
    if (trash) {
      if (can.delete && mayMutate(f))
        items.push({
          key: "restore",
          label: t("actions.restore"),
          icon: <RotateCcw className="size-4" aria-hidden />,
          onClick: () =>
            void restoreFileAction({ id: f.id }).then((r) => {
              if (r.ok) toast.success(t("toast.restored"));
              else toast.error(r.message);
              router.refresh();
            }),
        });
      if (can.admin)
        items.push({
          key: "purge",
          label: t("actions.purge"),
          icon: <Trash2 className="size-4" aria-hidden />,
          onClick: () => setPurge(f),
          destructive: true,
        });
      return items;
    }
    if (can.download)
      items.push({
        key: "download",
        label: t("actions.download"),
        icon: <Download className="size-4" aria-hidden />,
        onClick: () => download(f.id, (m) => toast.error(m)),
      });
    if (can.edit && mayMutate(f))
      items.push({
        key: "edit",
        label: t("actions.edit"),
        icon: <Pencil className="size-4" aria-hidden />,
        onClick: () => setEdit(f),
      });
    if (can.delete && mayMutate(f))
      items.push({
        key: "delete",
        label: t("actions.delete"),
        icon: <Trash2 className="size-4" aria-hidden />,
        onClick: () => setDel(f),
        destructive: true,
      });
    return items;
  };

  const columns: Column<FileRow>[] = useMemo(
    () => [
      { key: "name", header: t("columns.name"), render: nameCell, className: "max-w-xs" },
      { key: "courseCode", header: t("columns.course"), render: courseCell },
      {
        key: "classification",
        header: t("columns.classification"),
        render: (f) => <ClassificationBadge value={f.classification} />,
      },
      { key: "size", header: t("columns.size"), render: sizeCell, className: "w-24" },
      {
        key: "downloads",
        header: t("columns.downloads"),
        render: (f) => (
          <span className="tabular-nums" dir="ltr">
            {f.downloads}
          </span>
        ),
        className: "w-20 text-center",
      },
      { key: "createdAt", header: trash ? t("columns.deletedAt") : t("columns.date"), render: dateCell },
      {
        key: "id",
        header: tc("actions"),
        className: "w-12 text-end",
        render: (f) => {
          const items = actionsFor(f);
          if (!items.length) return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${tc("actions")}: ${f.name}`}
                  className="size-9"
                >
                  <MoreHorizontal className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {items.map((it, i) => (
                  <span key={it.key}>
                    {it.destructive && i > 0 && !items[i - 1]?.destructive && <DropdownMenuSeparator />}
                    <DropdownMenuItem
                      onSelect={it.onClick}
                      variant={it.destructive ? "destructive" : "default"}
                      className="min-h-10 gap-2"
                    >
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
    [t, tc, can, trash],
  );

  const pagination = {
    currentPage: page.page,
    totalPages: page.pageCount,
    onPageChange: (p: number) => setParams({ page: String(p) }),
    labels: {
      prev: tc("prev"),
      next: tc("next"),
      page: (c: number, n: number) => tc("pageOf", { current: c, total: n }),
    },
  };

  const usagePct =
    usage.capBytes > 0 ? Math.min(100, Math.round((usage.usedBytes / usage.capBytes) * 100)) : 0;

  const mobileActions = [
    ...(trash
      ? [
          ...(can.delete
            ? [
                {
                  label: t("actions.restore"),
                  onClick: (f: FileRow) =>
                    void restoreFileAction({ id: f.id }).then((r) => {
                      if (r.ok) toast.success(t("toast.restored"));
                      else toast.error(r.message);
                      router.refresh();
                    }),
                },
              ]
            : []),
          ...(can.admin
            ? [
                {
                  label: t("actions.purge"),
                  variant: "destructive" as const,
                  onClick: (f: FileRow) => setPurge(f),
                },
              ]
            : []),
        ]
      : [
          ...(can.download
            ? [
                {
                  label: t("actions.download"),
                  onClick: (f: FileRow) => download(f.id, (m) => toast.error(m)),
                },
              ]
            : []),
          ...(can.edit ? [{ label: t("actions.edit"), onClick: (f: FileRow) => setEdit(f) }] : []),
          ...(can.delete
            ? [
                {
                  label: t("actions.delete"),
                  variant: "destructive" as const,
                  onClick: (f: FileRow) => setDel(f),
                },
              ]
            : []),
        ]),
  ];

  return (
    <div className="space-y-4">
      <PageTabs
        tabs={FILE_TABS.map((id) => ({ id, label: t(`tabs.${id}`), badge: counts[id] ?? 0 }))}
        activeTab={query.tab}
        onTabChange={(id) => setParams({ tab: id })}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <form
          role="search"
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setParams({ q });
          }}
        >
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={tc("search")}
            className="min-h-11 ps-10"
          />
        </form>
        <Select value={query.category ?? "ALL"} onValueChange={(v) => setParams({ category: v })}>
          <SelectTrigger className="min-h-11 sm:w-44" aria-label={t("filters.category")}>
            <SelectValue placeholder={t("filters.allCategories")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("filters.allCategories")}</SelectItem>
            {FILE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {t(`category.${c}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={query.classification ?? "ALL"} onValueChange={(v) => setParams({ classification: v })}>
          <SelectTrigger className="min-h-11 sm:w-44" aria-label={t("filters.classification")}>
            <SelectValue placeholder={t("filters.allClassifications")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("filters.allClassifications")}</SelectItem>
            {DATA_CLASSIFICATIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {t(`classification.${c}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {lookups.courses.length > 0 && (
          <Select
            value={query.courseId ?? "ALL"}
            onValueChange={(v) => setParams({ courseId: v, offeringId: undefined })}
          >
            <SelectTrigger className="min-h-11 sm:w-56" aria-label={t("filters.course")}>
              <SelectValue placeholder={t("filters.allCourses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("filters.allCourses")}</SelectItem>
              {lookups.courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {can.admin && !trash && (
          <div className="flex min-h-11 items-center gap-2">
            <Switch
              id="files-mine"
              checked={query.mine}
              onCheckedChange={(c) => setParams({ mine: c ? "true" : undefined })}
            />
            <Label htmlFor="files-mine">{t("filters.mine")}</Label>
          </div>
        )}
        {can.upload && !trash && (
          <Button onClick={() => setUpload(true)} className="min-h-11 gap-2" data-testid="upload-file">
            <Upload className="size-4" aria-hidden /> {t("actions.upload")}
          </Button>
        )}
        {can.admin && trash && page.total > 0 && (
          <Button
            variant="destructive"
            onClick={() => setEmptyTrash(true)}
            className="min-h-11 gap-2"
            data-testid="empty-trash"
          >
            <Trash2 className="size-4" aria-hidden /> {t("actions.emptyTrash")}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("total", { count: page.total })}
        </p>
        {can.admin && (
          <div
            className="flex items-center gap-3 text-xs text-muted-foreground sm:w-80"
            data-testid="storage-usage"
          >
            <span className="whitespace-nowrap">{t("usage.label")}</span>
            <Progress
              value={usagePct}
              className="h-2 flex-1"
              aria-label={t("usage.percent", { percent: usagePct })}
            />
            <span className="whitespace-nowrap tabular-nums" dir="ltr">
              {t("usage.of", { used: formatBytes(usage.usedBytes), cap: formatBytes(usage.capBytes) })}
            </span>
          </div>
        )}
      </div>

      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={page.items}
          keyExtractor={(f) => f.id}
          emptyMessage={trash ? t("emptyTrash") : t("empty")}
          pagination={pagination}
          maxHeight="none"
        />
      </div>
      <div className="md:hidden">
        <MobileDataTable
          columns={[
            { key: "name", header: t("columns.name"), primary: true, render: nameCell },
            { key: "courseCode", header: t("columns.course"), secondary: true, render: courseCell },
            {
              key: "classification",
              header: t("columns.classification"),
              badge: true,
              render: (f) => <ClassificationBadge value={f.classification} />,
            },
            { key: "size", header: t("columns.size"), render: sizeCell },
            { key: "downloads", header: t("columns.downloads"), render: (f) => String(f.downloads) },
            {
              key: "createdAt",
              header: trash ? t("columns.deletedAt") : t("columns.date"),
              render: dateCell,
            },
          ]}
          data={page.items}
          keyExtractor={(f) => f.id}
          emptyMessage={trash ? t("emptyTrash") : t("empty")}
          actionsLabel={tc("actions")}
          actions={mobileActions}
          pagination={pagination}
        />
      </div>

      {can.upload && (
        <UploadDialog
          key={upload ? "open" : "closed"}
          open={upload}
          onOpenChange={setUpload}
          lookups={lookups}
          maxBytes={maxUploadBytes}
          defaultCourseId={query.courseId}
          defaultOfferingId={query.offeringId}
        />
      )}
      <EditFileDialog
        key={edit?.id ?? "closed"}
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        file={edit}
        lookups={lookups}
      />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={del ? `${t("actions.delete")}: ${del.name}` : ""}
        body={t("confirm.delete")}
        destructive
        onConfirm={async () => {
          if (!del) return { ok: true, data: null };
          const r = await deleteFileAction({ id: del.id });
          if (r.ok) toast.success(t("toast.deleted"));
          return r;
        }}
      />
      <ConfirmDialog
        open={!!purge}
        onOpenChange={(o) => !o && setPurge(null)}
        title={purge ? `${t("actions.purge")}: ${purge.name}` : ""}
        body={t("confirm.purge")}
        destructive
        onConfirm={async () => {
          if (!purge) return { ok: true, data: null };
          const r = await purgeFilesAction({ ids: [purge.id] });
          if (r.ok) toast.success(t("toast.purged", { count: r.data.purged }));
          return r;
        }}
      />
      <ConfirmDialog
        open={emptyTrash}
        onOpenChange={setEmptyTrash}
        title={t("actions.emptyTrash")}
        body={t("confirm.emptyTrash", { count: page.total })}
        destructive
        onConfirm={async () => {
          const r = await purgeFilesAction({ ids: page.items.map((f) => f.id) });
          if (r.ok) toast.success(t("toast.purged", { count: r.data.purged }));
          return r;
        }}
      />
    </div>
  );
}
