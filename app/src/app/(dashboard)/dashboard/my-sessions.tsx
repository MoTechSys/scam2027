"use client";

import { Monitor, Smartphone, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { revokeSessionAction } from "@/lib/session/actions";

export type SessionItem = {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
};

function describeAgent(ua: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: "—", mobile: false };
  const mobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return { label: [browser, os].filter(Boolean).join(" · "), mobile };
}

/** `::ffff:10.0.0.1` → `10.0.0.1`, `::1` → `localhost`; anything else unchanged. */
export function prettyIp(ip: string | null): string {
  if (!ip) return "—";
  if (ip === "::1" || ip === "127.0.0.1") return "localhost";
  return ip.replace(/^::ffff:/i, "");
}

export function MySessions({ sessions, compact = false }: { sessions: SessionItem[]; compact?: boolean }) {
  const t = useTranslations("dashboard");
  const f = useFormatter();
  const [pending, start] = useTransition();

  const revoke = (id: string) =>
    start(async () => {
      const r = await revokeSessionAction(id);
      if (!r.ok) toast.error(r.message);
    });

  return (
    <ul className="divide-y divide-border">
      {sessions.map((s) => {
        const agent = describeAgent(s.userAgent);
        const Icon = agent.mobile ? Smartphone : Monitor;
        return (
          <li
            key={s.id}
            className={compact ? "flex items-center gap-2 py-1.5" : "flex items-center gap-3 py-3"}
          >
            <div
              className={
                compact
                  ? "flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10"
                  : "flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10"
              }
            >
              <Icon
                className={compact ? "size-3.5 text-primary" : "size-5 text-primary"}
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className={compact ? "truncate text-xs font-medium" : "truncate text-sm font-medium"}>
                {agent.label}
                {s.current && (
                  <Badge className="ms-2 align-middle" variant="secondary">
                    {t("current")}
                  </Badge>
                )}
              </p>
              <p
                dir="ltr"
                className={
                  compact
                    ? "truncate text-start text-[10px] text-muted-foreground"
                    : "truncate text-start text-xs text-muted-foreground"
                }
              >
                {prettyIp(s.ip)} · {f.relativeTime(new Date(s.lastSeenAt))}
              </p>
            </div>
            {!s.current && (
              <Button
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => revoke(s.id)}
                disabled={pending}
                aria-label={`${t("revoke")} — ${agent.label}`}
              >
                <X className="size-5" aria-hidden="true" />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
