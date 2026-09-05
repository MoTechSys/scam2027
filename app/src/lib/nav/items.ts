/**
 * Navigation model — built from the permission catalogue (docs/30-architecture/05-UI-DESIGN-SYSTEM.md §3).
 * Items whose `permission` the user lacks are never rendered (and their routes are guarded server-side anyway).
 * `phase` marks routes that ship in later roadmap phases; they are hidden until implemented (no dead links).
 */
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  BookOpen,
  Code2,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Settings,
  Shield,
  User,
  Users,
} from "lucide-react";
import type { PermissionCode } from "@/lib/auth/permissions";

export type NavKey =
  | "dashboard"
  | "users"
  | "roles"
  | "academic"
  | "courses"
  | "notifications"
  | "reports"
  | "audit"
  | "settings"
  | "profile"
  | "developer";

export interface NavItem {
  key: NavKey;
  href: string;
  icon: LucideIcon;
  permission?: PermissionCode;
  /** Roadmap phase in which the route becomes available. Undefined = available now. */
  phase?: "P1" | "P2" | "P3" | "P4";
  /** Show in the mobile bottom bar (max 4 + "more"). */
  bottom?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view", bottom: true },
  { key: "users", href: "/users", icon: Users, permission: "user.view", bottom: true },
  { key: "roles", href: "/roles", icon: Shield, permission: "role.view" },
  { key: "academic", href: "/academic", icon: GraduationCap, permission: "academic.view", phase: "P1" },
  { key: "courses", href: "/courses", icon: BookOpen, permission: "course.view", phase: "P2", bottom: true },
  { key: "notifications", href: "/notifications", icon: Bell, permission: "notification.view", phase: "P3", bottom: true },
  { key: "reports", href: "/reports", icon: BarChart3, permission: "report.view", phase: "P3" },
  { key: "audit", href: "/audit", icon: FileText, permission: "audit.view", phase: "P1" },
  { key: "settings", href: "/settings", icon: Settings, permission: "settings.view", phase: "P1" },
  { key: "profile", href: "/profile", icon: User, phase: "P1" },
  { key: "developer", href: "/developer", icon: Code2 },
] as const;

export function visibleNavItems(permissions: ReadonlySet<string>): NavItem[] {
  return NAV_ITEMS.filter((i) => !i.phase && (!i.permission || permissions.has(i.permission)));
}
