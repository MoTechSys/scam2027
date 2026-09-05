import type { NavKey } from "@/lib/nav/items";

/** Serializable nav item passed from RSC to client layout (icons resolved client-side by key). */
export type NavLink = { key: NavKey; href: string; bottom?: boolean };

export type LayoutUser = {
  name: string;
  email: string;
  roles: string[];
  locale: string;
  /** Unread notifications for the header bell; `null` hides the bell (no `notification.view`). */
  unreadNotifications: number | null;
};

export type LayoutTenant = { name: string; logoUrl: string | null };
