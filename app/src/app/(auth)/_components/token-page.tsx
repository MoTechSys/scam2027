import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { inspectTokenAction } from "@/features/auth/actions";
import { loadSecurityPolicy } from "@/features/auth/core";
import { tx } from "@/lib/db/tenant";
import { AuthCard } from "./auth-card";
import { TokenPasswordForm } from "./token-password-form";

/** RSC for /reset and /activate: validates the token up front so the user sees a clear state, never a dead form. */
export async function TokenPage({
  purpose,
  token,
}: {
  purpose: "RESET" | "ACTIVATE";
  token: string | undefined;
}) {
  const t = await getTranslations("auth");
  const title = t(purpose === "RESET" ? "resetTitle" : "activateTitle");
  const state = await inspectTokenAction(token ?? "", purpose);
  if (!state.valid) {
    return (
      <AuthCard title={title}>
        <div className="space-y-5" data-testid="token-invalid" data-reason={state.reason}>
          <Alert variant="destructive" role="alert">
            <AlertDescription>{t(`tokenErrors.${state.reason}`)}</AlertDescription>
          </Alert>
          {purpose === "RESET" && (
            <Button asChild variant="outline" className="min-h-11 w-full">
              <Link href="/forgot">{t("requestNewLink")}</Link>
            </Button>
          )}
        </div>
      </AuthCard>
    );
  }
  const tenantId = (await headers()).get("x-tenant-id")!;
  const policy = await tx(tenantId, (tt) => loadSecurityPolicy(tt, tenantId));
  return (
    <AuthCard
      title={title}
      subtitle={t(purpose === "RESET" ? "resetSubtitle" : "activateSubtitle", { name: state.name })}
    >
      <TokenPasswordForm token={token!} purpose={purpose} minLength={policy.passwordMinLength} />
    </AuthCard>
  );
}
