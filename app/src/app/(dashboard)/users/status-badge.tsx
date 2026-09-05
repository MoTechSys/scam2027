import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { UserStatusValue } from "@/features/users/schemas";

const STYLE: Record<UserStatusValue | "DELETED", string> = {
  ACTIVE: "border-transparent bg-primary/15 text-primary",
  PENDING_ACTIVATION: "border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400",
  FROZEN: "border-transparent bg-sky-500/15 text-sky-600 dark:text-sky-400",
  DISABLED: "border-transparent bg-destructive/15 text-destructive",
  DELETED: "border-transparent bg-muted text-muted-foreground",
};

export function UserStatusBadge({ status, deleted }: { status: UserStatusValue; deleted?: boolean }) {
  const t = useTranslations("users.status");
  const key = deleted ? "DELETED" : status;
  return (
    <Badge variant="outline" className={STYLE[key]}>
      {t(key)}
    </Badge>
  );
}
