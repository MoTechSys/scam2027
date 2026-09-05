"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type {
  NotificationPriority,
  NotificationTarget,
  NotificationType,
} from "@/features/notifications/schemas";

const PRIORITY_STYLE: Record<NotificationPriority, string> = {
  LOW: "border-transparent bg-muted text-muted-foreground",
  NORMAL: "border-transparent bg-primary/15 text-primary",
  HIGH: "border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400",
  URGENT: "border-transparent bg-destructive/15 text-destructive",
};

export function PriorityBadge({ value }: { value: NotificationPriority }) {
  const t = useTranslations("notifications.priority");
  return (
    <Badge variant="outline" className={PRIORITY_STYLE[value]} data-testid="notif-priority">
      {t(value)}
    </Badge>
  );
}

export function TypeBadge({ value }: { value: NotificationType }) {
  const t = useTranslations("notifications.type");
  return (
    <Badge variant="outline" className="border-border text-xs font-normal" data-testid="notif-type">
      {t(value)}
    </Badge>
  );
}

/** "Everyone" / "Section · 2" style summary of a stored target spec. */
export function TargetLabel({ target }: { target: NotificationTarget }) {
  const t = useTranslations("notifications");
  if (target.kind === "ALL") return <span>{t("target.ALL")}</span>;
  return (
    <span>
      {t(`target.${target.kind}`)} · {t("count", { count: target.ids.length })}
    </span>
  );
}
