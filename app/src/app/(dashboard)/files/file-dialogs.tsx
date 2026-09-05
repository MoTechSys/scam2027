"use client";

/**
 * File dialogs (P1-06): multi-file upload with per-file progress (XHR → /api/files/upload, metadata fields first so
 * the server knows the attachment before bytes arrive) and metadata edit (Server Action). Parents remount via `key`.
 */
import { CheckCircle2, CloudUpload, Loader2, Trash2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { DialogShell } from "@/components/forms/dialog-shell";
import { FormFooter, SelectField, TextAreaField, TextField, formValues } from "@/components/forms/fields";
import { useSubmit } from "@/components/forms/use-submit";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { updateFileAction } from "@/features/files/actions";
import type { FileRow, OfferingOption } from "@/features/files/queries";
import {
  DATA_CLASSIFICATIONS,
  FILE_CATEGORIES,
  type DataClassification,
  type FileCategory,
} from "@/features/files/schemas";
import type { Option } from "@/lib/contracts/option";
import type { Failure } from "@/lib/result";
import { ACCEPT_ATTRIBUTE, ALLOWED_EXTENSIONS, extensionOf, formatBytes } from "@/lib/storage/validate";

type Base = { open: boolean; onOpenChange: (o: boolean) => void };
export type FileLookups = { courses: Option[]; offerings: OfferingOption[] };

const NONE = "NONE";
type UploadErrorKey =
  | "EXTENSION_NOT_ALLOWED"
  | "CONTENT_MISMATCH"
  | "TOO_LARGE"
  | "EMPTY"
  | "MISSING"
  | "QUOTA"
  | "NETWORK"
  | "UNKNOWN";
const ERROR_KEYS: ReadonlySet<string> = new Set([
  "EXTENSION_NOT_ALLOWED",
  "CONTENT_MISMATCH",
  "TOO_LARGE",
  "EMPTY",
  "MISSING",
  "QUOTA",
]);

/* ───────── Attachment fields (shared by upload + edit) ───────── */
function AttachmentFields({
  lookups,
  courseId,
  offeringId,
  onCourse,
  onOffering,
  errors,
}: {
  lookups: FileLookups;
  courseId: string;
  offeringId: string;
  onCourse: (v: string) => void;
  onOffering: (v: string) => void;
  errors: Record<string, string[]>;
}) {
  const t = useTranslations("files");
  const none = { id: NONE, label: t("form.none") };
  const offerings = lookups.offerings.filter(
    (o) => courseId === NONE || !courseId || o.courseId === courseId,
  );
  return (
    <>
      <SelectField
        id="file-course"
        name="courseId"
        label={t("form.course")}
        errors={errors}
        optional
        value={courseId || NONE}
        onChange={(v) => {
          onCourse(v);
          // Keep the offering consistent with the course.
          const off = lookups.offerings.find((o) => o.id === offeringId);
          if (off && v !== NONE && off.courseId !== v) onOffering(NONE);
        }}
        options={[none, ...lookups.courses]}
      />
      <SelectField
        id="file-offering"
        name="offeringId"
        label={t("form.offering")}
        errors={errors}
        optional
        value={offeringId || NONE}
        onChange={(v) => {
          onOffering(v);
          const off = lookups.offerings.find((o) => o.id === v);
          if (off) onCourse(off.courseId);
        }}
        options={[none, ...offerings]}
      />
      <p className="text-xs text-muted-foreground sm:col-span-2">{t("form.attachHint")}</p>
    </>
  );
}

function EnumSelects({
  category,
  classification,
  onCategory,
  onClassification,
  errors,
}: {
  category: FileCategory;
  classification: DataClassification;
  onCategory: (v: FileCategory) => void;
  onClassification: (v: DataClassification) => void;
  errors: Record<string, string[]>;
}) {
  const t = useTranslations("files");
  return (
    <>
      <SelectField
        id="file-category"
        name="category"
        label={t("form.category")}
        errors={errors}
        value={category}
        onChange={(v) => onCategory(v as FileCategory)}
        options={FILE_CATEGORIES.map((c) => ({ id: c, label: t(`category.${c}`) }))}
      />
      <SelectField
        id="file-classification"
        name="classification"
        label={t("form.classification")}
        errors={errors}
        value={classification}
        onChange={(v) => onClassification(v as DataClassification)}
        options={DATA_CLASSIFICATIONS.map((c) => ({ id: c, label: t(`classification.${c}`) }))}
      />
    </>
  );
}

/* ═══════════════ Upload ═══════════════ */
type QueueItem = {
  key: string;
  file: File;
  status: "waiting" | "uploading" | "done" | "failed";
  progress: number; // 0..100
  error?: UploadErrorKey;
};

function uploadOne(
  item: QueueItem,
  meta: Record<string, string>,
  onProgress: (pct: number) => void,
): Promise<{ ok: true } | { ok: false; error: UploadErrorKey }> {
  return new Promise((resolve) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(meta)) if (v && v !== NONE) fd.append(k, v);
    fd.append("file", item.file, item.file.name); // last — server needs the fields first
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files/upload");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => resolve({ ok: false, error: "NETWORK" });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve({ ok: true });
      const body = xhr.response as Failure | null;
      const reason = body?.fieldErrors?.file?.[0];
      resolve({
        ok: false,
        error: reason && ERROR_KEYS.has(reason) ? (reason as UploadErrorKey) : "UNKNOWN",
      });
    };
    xhr.send(fd);
  });
}

export function UploadDialog({
  open,
  onOpenChange,
  lookups,
  maxBytes,
  defaultCourseId,
  defaultOfferingId,
}: Base & {
  lookups: FileLookups;
  maxBytes: number;
  defaultCourseId?: string;
  defaultOfferingId?: string;
}) {
  const t = useTranslations("files");
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [category, setCategory] = useState<FileCategory>("LECTURE");
  const [classification, setClassification] = useState<DataClassification>("INTERNAL");
  const [courseId, setCourseId] = useState(defaultCourseId ?? NONE);
  const [offeringId, setOfferingId] = useState(defaultOfferingId ?? NONE);
  const [description, setDescription] = useState("");

  const addFiles = (list: FileList | File[]) => {
    const next: QueueItem[] = [];
    for (const f of Array.from(list)) {
      const ext = extensionOf(f.name);
      const bad: UploadErrorKey | undefined = !ALLOWED_EXTENSIONS.includes(ext)
        ? "EXTENSION_NOT_ALLOWED"
        : f.size > maxBytes
          ? "TOO_LARGE"
          : f.size === 0
            ? "EMPTY"
            : undefined;
      next.push({
        key: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        status: bad ? "failed" : "waiting",
        progress: 0,
        error: bad,
      });
    }
    setQueue((q) => [...q, ...next]);
  };

  const patch = (key: string, p: Partial<QueueItem>) =>
    setQueue((q) => q.map((it) => (it.key === key ? { ...it, ...p } : it)));

  const start = async () => {
    const pending = queue.filter((i) => i.status === "waiting");
    if (!pending.length) return;
    setBusy(true);
    const meta = { category, classification, courseId, offeringId, description };
    let ok = 0;
    let failed = 0;
    for (const item of pending) {
      patch(item.key, { status: "uploading", progress: 0 });
      const r = await uploadOne(item, meta, (pct) => patch(item.key, { progress: pct }));
      if (r.ok) {
        ok++;
        patch(item.key, { status: "done", progress: 100 });
      } else {
        failed++;
        patch(item.key, { status: "failed", error: r.error });
      }
    }
    setBusy(false);
    if (failed === 0) toast.success(t("upload.allDone", { count: ok }));
    else toast.error(t("upload.someFailed", { ok, failed }));
    router.refresh();
    if (failed === 0) onOpenChange(false);
  };

  const waiting = queue.filter((i) => i.status === "waiting").length;

  return (
    <DialogShell open={open} onOpenChange={(o) => !busy && onOpenChange(o)} wide title={t("upload.title")}>
      <div className="space-y-4" data-testid="upload-form">
        <div className="grid gap-4 sm:grid-cols-2">
          <EnumSelects
            category={category}
            classification={classification}
            onCategory={setCategory}
            onClassification={setClassification}
            errors={{}}
          />
          <AttachmentFields
            lookups={lookups}
            courseId={courseId}
            offeringId={offeringId}
            onCourse={setCourseId}
            onOffering={setOfferingId}
            errors={{}}
          />
          <TextAreaField
            id="file-description"
            name="description"
            label={t("form.description")}
            errors={{}}
            optional
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="sm:col-span-2"
          />
        </div>

        {/* Drag-and-drop is a pointer-only enhancement; keyboard/touch users use the labelled file input below. */}
        <div
          role="presentation"
          data-testid="dropzone"
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
          }}
        >
          <CloudUpload className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm">
            {t("upload.dropHere")}{" "}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 align-baseline"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              {t("upload.browse")}
            </Button>
          </p>
          <p className="text-xs text-muted-foreground">
            {t("upload.limits", { types: ALLOWED_EXTENSIONS.join(", "), max: formatBytes(maxBytes) })}
          </p>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            multiple
            accept={ACCEPT_ATTRIBUTE}
            className="sr-only"
            aria-label={t("upload.browse")}
            data-testid="file-input"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {queue.length > 0 && (
          <ul
            className="space-y-2"
            aria-label={t("upload.queue", { count: queue.length })}
            data-testid="upload-queue"
          >
            {queue.map((it) => (
              <li key={it.key} className="rounded-lg border p-3" data-status={it.status}>
                <div className="flex items-center gap-2">
                  {it.status === "done" && (
                    <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden />
                  )}
                  {it.status === "failed" && (
                    <XCircle className="size-4 shrink-0 text-destructive" aria-hidden />
                  )}
                  {it.status === "uploading" && (
                    <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm" title={it.file.name}>
                    {it.file.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums" dir="ltr">
                    {formatBytes(it.file.size)}
                  </span>
                  {it.status !== "uploading" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0"
                      aria-label={t("upload.remove")}
                      disabled={busy}
                      onClick={() => setQueue((q) => q.filter((x) => x.key !== it.key))}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  )}
                </div>
                {it.status === "uploading" && (
                  <Progress value={it.progress} className="mt-2 h-1.5" aria-label={t("upload.uploading")} />
                )}
                <p
                  className="mt-1 text-xs text-muted-foreground"
                  role={it.status === "failed" ? "alert" : undefined}
                >
                  {it.status === "failed"
                    ? t(`errors.${it.error ?? "UNKNOWN"}`)
                    : it.status === "done"
                      ? t("upload.done")
                      : it.status === "uploading"
                        ? `${t("upload.uploading")} ${it.progress}%`
                        : t("upload.waiting")}
                </p>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            data-testid="close-upload"
          >
            {t("upload.close")}
          </Button>
          <Button
            type="button"
            className="min-h-11 gap-2"
            onClick={start}
            disabled={busy || waiting === 0}
            data-testid="start-upload"
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("upload.start")} {waiting > 0 ? `(${waiting})` : ""}
          </Button>
        </DialogFooter>
      </div>
    </DialogShell>
  );
}

/* ═══════════════ Edit ═══════════════ */
export function EditFileDialog({
  open,
  onOpenChange,
  file,
  lookups,
}: Base & { file: FileRow | null; lookups: FileLookups }) {
  const t = useTranslations("files");
  const { pending, errors, run, reset } = useSubmit(onOpenChange, t("toast.updated"));
  const [category, setCategory] = useState<FileCategory>(file?.category ?? "OTHER");
  const [classification, setClassification] = useState<DataClassification>(
    file?.classification ?? "INTERNAL",
  );
  const [courseId, setCourseId] = useState(file?.courseId ?? NONE);
  const [offeringId, setOfferingId] = useState(file?.offeringId ?? NONE);
  if (!file) return null;

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      onReset={reset}
      wide
      title={t("dialogs.edit")}
      description={file.originalName}
    >
      <form
        noValidate
        className="space-y-4"
        data-testid="file-form"
        onSubmit={(e) => {
          e.preventDefault();
          const v = formValues(new FormData(e.currentTarget));
          run(() =>
            updateFileAction({
              id: file.id,
              name: v.name,
              category,
              classification,
              courseId: courseId === NONE ? "" : courseId,
              offeringId: offeringId === NONE ? "" : offeringId,
              description: v.description,
            }),
          );
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="file-name"
            name="name"
            label={t("form.name")}
            errors={errors}
            defaultValue={file.name}
            maxLength={160}
            required
            className="sm:col-span-2"
          />
          <EnumSelects
            category={category}
            classification={classification}
            onCategory={setCategory}
            onClassification={setClassification}
            errors={errors}
          />
          <AttachmentFields
            lookups={lookups}
            courseId={courseId}
            offeringId={offeringId}
            onCourse={setCourseId}
            onOffering={setOfferingId}
            errors={errors}
          />
          <TextAreaField
            id="file-edit-description"
            name="description"
            label={t("form.description")}
            errors={errors}
            optional
            maxLength={1000}
            defaultValue={file.description ?? ""}
            className="sm:col-span-2"
          />
        </div>
        <FormFooter pending={pending} onCancel={() => onOpenChange(false)} />
      </form>
    </DialogShell>
  );
}
