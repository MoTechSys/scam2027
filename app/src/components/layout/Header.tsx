"use client";

import { Languages, LogOut, Menu, Moon, Sun, User as UserIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction, setLocaleAction } from "@/lib/session/actions";
import { NotificationBell } from "./NotificationBell";
import type { LayoutTenant, LayoutUser } from "./types";

type Props = { user: LayoutUser; tenant: LayoutTenant; onOpenMenu: () => void };

const THEME_KEY = "scam.theme";

function readTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function applyTheme(theme: "dark" | "light") {
  const root = document.documentElement;
  if (theme === "light") {
    root.dataset.theme = "light";
    root.classList.remove("dark");
  } else {
    delete root.dataset.theme;
    root.classList.add("dark");
  }
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

export function Header({ user, tenant, onOpenMenu }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    // Restore the persisted theme once on mount (default is dark, set on <html> by the server).
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch {
      /* ignore */
    }
    const initial = stored === "light" ? "light" : readTheme();
    if (initial !== readTheme()) applyTheme(initial);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with persisted browser state
    setTheme(initial);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  };

  const toggleLocale = () => {
    const next = user.locale === "ar" ? "en" : "ar";
    startTransition(async () => {
      const r = await setLocaleAction(next);
      if (!r.ok) toast.error(r.message);
      else router.refresh();
    });
  };

  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join("");

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="size-11 lg:hidden"
        onClick={onOpenMenu}
        aria-label={t("common.openMenu")}
      >
        <Menu className="size-6" aria-hidden="true" />
      </Button>

      <p className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">{tenant.name}</p>

      <NotificationBell initialCount={user.unreadNotifications} />

      <Button
        variant="ghost"
        size="icon"
        className="size-11"
        onClick={toggleLocale}
        disabled={pending}
        aria-label={`${t("common.language")}: ${user.locale === "ar" ? t("common.english") : t("common.arabic")}`}
      >
        <Languages className="size-5" aria-hidden="true" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="size-11"
        onClick={toggleTheme}
        aria-label={t("common.toggleTheme")}
        aria-pressed={theme === "light"}
      >
        {theme === "dark" ? (
          <Sun className="size-5" aria-hidden="true" />
        ) : (
          <Moon className="size-5" aria-hidden="true" />
        )}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-11 gap-2 px-2" aria-label={user.name}>
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="hidden max-w-40 truncate text-sm font-medium md:inline">{user.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate font-semibold">{user.name}</span>
            <span dir="ltr" className="truncate text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
            <span className="text-xs font-normal text-primary">{user.roles.join(" · ")}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled className="min-h-11 gap-2">
            <UserIcon className="size-4" aria-hidden="true" />
            {t("nav.profile")}
            <span className="ms-auto text-xs text-muted-foreground">P1</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <form action={logoutAction}>
            <DropdownMenuItem asChild variant="destructive" className="min-h-11 gap-2">
              <button type="submit" className="w-full">
                <LogOut className="size-4" aria-hidden="true" />
                {t("auth.logout")}
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
