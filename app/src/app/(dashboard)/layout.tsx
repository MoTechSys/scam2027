import { DashboardLayout } from "@/components/layout/DashboardLayout";
import type { NavLink } from "@/components/layout/types";
import { hasPermission, requireUser } from "@/lib/auth/rbac";
import { visibleNavItems } from "@/lib/nav/items";
import { currentTenant } from "@/lib/tenant/current";
import { resolveLocale } from "@/i18n/request";
import { unreadCount } from "@/features/notifications/queries";
import { loadAppearance } from "@/features/profile/queries";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  const [tenant, locale, unread, appearance] = await Promise.all([
    currentTenant(),
    resolveLocale(),
    hasPermission(ctx, "notification.view") ? unreadCount(ctx) : Promise.resolve(null),
    loadAppearance(ctx),
  ]);
  const items: NavLink[] = visibleNavItems(ctx.user.permissions).map(({ key, href, bottom }) => ({
    key,
    href,
    bottom,
  }));

  return (
    <DashboardLayout
      items={items}
      user={{
        name: ctx.user.name,
        email: ctx.user.email,
        roles: ctx.user.roles,
        locale,
        unreadNotifications: unread,
        theme: appearance.theme,
        avatarUrl: appearance.avatarUrl,
      }}
      tenant={{ name: tenant?.name ?? "scam2027", logoUrl: tenant?.branding?.logoUrl ?? null }}
    >
      {children}
    </DashboardLayout>
  );
}
