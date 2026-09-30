import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { loadSecurityPolicy } from "@/features/auth/core";
import { CHANGE_REASONS, type ChangeReason } from "@/features/auth/schemas";
import { requireUser } from "@/lib/auth/rbac";
import { tx } from "@/lib/db/tenant";
import { AuthCard } from "../_components/auth-card";
import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("changeTitle") };
}

/**
 * FR-AUTH-010/011. Reachable voluntarily (from the profile) and as the forced landing page while
 * `passwordChangeRequired` is set — the only dashboard-adjacent page that opts out of that redirect.
 */
export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; next?: string }>;
}) {
  const [ctx, t, sp] = await Promise.all([
    requireUser({ allowPasswordChangeRequired: true }),
    getTranslations("auth"),
    searchParams,
  ]);
  const policy = await tx(ctx.tenantId, (tt) => loadSecurityPolicy(tt, ctx.tenantId));
  const forced = ctx.user.passwordChangeRequired;
  const hinted = sp.reason?.toUpperCase();
  const reason: ChangeReason | null =
    forced ??
    ((CHANGE_REASONS as readonly string[]).includes(hinted ?? "") ? (hinted as ChangeReason) : null);
  return (
    <AuthCard title={t("changeTitle")} subtitle={t("changeSubtitle")} backToLogin={false}>
      <ChangePasswordForm
        reason={reason}
        forced={forced !== null}
        minLength={policy.passwordMinLength}
        next={sp.next}
      />
    </AuthCard>
  );
}
