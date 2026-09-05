import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import {
  canViewSent,
  inboxCounts,
  listInbox,
  listSent,
  preferences,
  targetLookups,
} from "@/features/notifications/queries";
import { inboxQuerySchema } from "@/features/notifications/schemas";
import { allowedTargetKinds, isNotificationAdmin } from "@/features/notifications/scope";
import { hasPermission, requireUser } from "@/lib/auth/rbac";
import { NotificationsClient } from "./notifications-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications");
  return { title: t("title") };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** `/notifications` — inbox (all / unread / archive), sent list with read stats, in-app preferences (P1-07). */
export default async function NotificationsPage({ searchParams }: Props) {
  const ctx = await requireUser();
  if (!hasPermission(ctx, "notification.view")) redirect("/unauthorized");
  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const parsed = inboxQuerySchema.safeParse(flat);
  let query = parsed.success ? parsed.data : inboxQuerySchema.parse({});
  const sentAllowed = canViewSent(ctx);
  if (query.tab === "SENT" && !sentAllowed) query = { ...query, tab: "ALL" };
  const canSend = hasPermission(ctx, "notification.send");
  const prefsTab = flat.tab === "PREFS";

  const [page, sent, counts, prefs, lookups, t] = await Promise.all([
    query.tab === "SENT" || prefsTab ? Promise.resolve(null) : listInbox(ctx, query),
    query.tab === "SENT" ? listSent(ctx, query) : Promise.resolve(null),
    inboxCounts(ctx),
    preferences(ctx),
    canSend ? targetLookups(ctx) : Promise.resolve(null),
    getTranslations("notifications"),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>
      <NotificationsClient
        tab={prefsTab ? "PREFS" : query.tab}
        query={query}
        inbox={page}
        sent={sent}
        counts={counts}
        prefs={prefs}
        lookups={lookups}
        allowedKinds={canSend ? allowedTargetKinds(ctx) : []}
        openCompose={canSend && flat.new === "1"}
        can={{ send: canSend, viewSent: sentAllowed, admin: isNotificationAdmin(ctx) }}
      />
    </div>
  );
}
