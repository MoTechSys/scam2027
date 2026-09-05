import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import {
  attachableCourseOptions,
  attachableOfferingOptions,
  fileCounts,
  listFiles,
  storageUsage,
} from "@/features/files/queries";
import { fileListQuerySchema } from "@/features/files/schemas";
import { isFileAdmin } from "@/features/files/scope";
import { hasPermission, requireUser } from "@/lib/auth/rbac";
import { env } from "@/lib/env";
import { FilesClient } from "./files-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("files");
  return { title: t("title") };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** `/files` — tenant file library (P1-06). Rows are narrowed by `fileScopeWhere`; uploads stream to /api/files/upload. */
export default async function FilesPage({ searchParams }: Props) {
  const ctx = await requireUser();
  if (!hasPermission(ctx, "file.view")) redirect("/unauthorized");
  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const parsed = fileListQuerySchema.safeParse(flat);
  const query = parsed.success ? parsed.data : fileListQuerySchema.parse({});
  const admin = isFileAdmin(ctx);
  const canUpload = hasPermission(ctx, "file.upload");
  const canEdit = hasPermission(ctx, "file.edit");
  const needLookups = canUpload || canEdit;

  const [page, counts, usage, courses, offerings, t] = await Promise.all([
    listFiles(ctx, query),
    fileCounts(ctx, query),
    storageUsage(ctx),
    needLookups ? attachableCourseOptions(ctx) : Promise.resolve([]),
    needLookups ? attachableOfferingOptions(ctx) : Promise.resolve([]),
    getTranslations("files"),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{admin ? t("title") : t("myTitle")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>
      <FilesClient
        page={page}
        query={query}
        counts={counts}
        usage={usage}
        lookups={{ courses, offerings }}
        maxUploadBytes={env.MAX_UPLOAD_BYTES}
        openUpload={canUpload && flat.new === "1"}
        can={{
          upload: canUpload,
          edit: canEdit,
          delete: hasPermission(ctx, "file.delete"),
          download: hasPermission(ctx, "file.download"),
          admin,
        }}
      />
    </div>
  );
}
