"use client";

import { Bot, UserX } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { AuditActor } from "@/features/audit/queries";

/** Actor rendering shared by the table, the mobile list and the details sheet. */
export function ActorCell({ actor, link = true }: { actor: AuditActor; link?: boolean }) {
  const t = useTranslations("audit");
  if (actor.kind === "system")
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Bot className="size-3.5" aria-hidden />
        {t("actor.system")}
      </span>
    );
  if (actor.deleted)
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground" title={actor.id}>
        <UserX className="size-3.5" aria-hidden />
        {t("actor.deleted")}
      </span>
    );
  const body = (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="truncate font-medium">{actor.name}</span>
      <span className="truncate text-xs text-muted-foreground" dir="ltr">
        {actor.academicId}
      </span>
    </span>
  );
  return link ? (
    <Link href={`/users/${actor.id}`} className="min-w-0 hover:underline" prefetch={false}>
      {body}
    </Link>
  ) : (
    body
  );
}
