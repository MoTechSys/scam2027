"use client";

/** Status badges shared by /courses, /offerings and rosters (P1-05). */
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { EnrollmentStatus } from "@/features/enrollment/schemas";
import type { InstructorRole, OfferingStatus } from "@/features/offerings/schemas";

const ACTIVE = "border-transparent bg-primary/15 text-primary";
const MUTED = "border-transparent bg-muted text-muted-foreground";
const AMBER = "border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400";
const SKY = "border-transparent bg-sky-500/15 text-sky-600 dark:text-sky-400";
const RED = "border-transparent bg-destructive/15 text-destructive";

export function CourseStateBadge({ isActive, deleted }: { isActive: boolean; deleted: boolean }) {
  const t = useTranslations("courses.active");
  const key = deleted ? "deleted" : isActive ? "true" : "false";
  return (
    <Badge variant="outline" className={deleted ? MUTED : isActive ? ACTIVE : AMBER}>
      {t(key)}
    </Badge>
  );
}

const OFFERING_STYLE: Record<OfferingStatus, string> = {
  DRAFT: AMBER,
  OPEN: ACTIVE,
  CLOSED: SKY,
  ARCHIVED: MUTED,
};
export function OfferingStatusBadge({ status }: { status: OfferingStatus }) {
  const t = useTranslations("offerings.status");
  return (
    <Badge variant="outline" className={OFFERING_STYLE[status]} data-testid="offering-status">
      {t(status)}
    </Badge>
  );
}

const ENROLLMENT_STYLE: Record<EnrollmentStatus, string> = { ACTIVE, WITHDRAWN: RED, COMPLETED: SKY };
export function EnrollmentStatusBadge({ status }: { status: EnrollmentStatus }) {
  const t = useTranslations("enrollment.status");
  return (
    <Badge variant="outline" className={ENROLLMENT_STYLE[status]}>
      {t(status)}
    </Badge>
  );
}

export function InstructorRoleBadge({ role }: { role: InstructorRole }) {
  const t = useTranslations("offerings.role");
  return (
    <Badge variant="outline" className={role === "PRIMARY" ? ACTIVE : MUTED}>
      {t(role)}
    </Badge>
  );
}
