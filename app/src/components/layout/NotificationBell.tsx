"use client";

/**
 * Header bell with unread badge (FR-NTF-003). Seeded with the server count, then refreshed on route change and every
 * 60 s while the tab is visible via GET /api/notifications/unread-count. Hidden when the user lacks `notification.view`.
 */
import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const POLL_MS = 60_000;

type Props = { initialCount: number | null };

export function NotificationBell({ initialCount }: Props) {
  const t = useTranslations("notifications");
  const pathname = usePathname();
  const [count, setCount] = useState(initialCount ?? 0);

  useEffect(() => {
    if (initialCount === null) return;
    let cancelled = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/notifications/unread-count", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { ok: boolean; data?: { count: number } };
        if (!cancelled && json.ok && json.data) setCount(json.data.count);
      } catch {
        /* offline — keep the last value */
      }
    };
    void load();
    const id = setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", load);
    };
  }, [pathname, initialCount]);

  if (initialCount === null) return null;
  const label = count > 0 ? t("bell.unread", { count }) : t("bell.none");
  return (
    <Button variant="ghost" size="icon" className="relative size-11" asChild>
      <Link href="/notifications" aria-label={label} data-testid="notif-bell" data-count={count}>
        <Bell className="size-5" aria-hidden="true" />
        {count > 0 && (
          <span
            data-testid="notif-badge"
            className="absolute end-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-bold text-primary-foreground"
            aria-hidden="true"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    </Button>
  );
}
