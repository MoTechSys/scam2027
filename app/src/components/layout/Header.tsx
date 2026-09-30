"use client";

/**
 * Sticky app header (ADR-0007).
 *  - `< lg`: 56px app bar — brand mark + current page title/subtitle (from PageHeader context), bell, avatar menu
 *    (language + theme live inside the menu to keep the bar calm).
 *  - `lg+`: 64px — tenant name, bell, language, theme, avatar menu (unchanged behaviour).
 * ☰ (mobile only) opens the navigation drawer — there is no "more" item in the bottom bar (ADR-0008 §5).
 */
import { Languages, LogOut, Menu, Moon, Sun, User as UserIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateThemeAction } from "@/features/profile/actions";
import type { Theme } from "@/features/profile/schemas";
import { logoutAction, setLocaleAction } from "@/lib/session/actions";
import { applyThemeToDocument, resolveTheme, type Resolved } from "@/lib/theme";
import { NotificationBell } from "./NotificationBell";
import { DESKTOP_HEADER_QUERY, useCurrentPageHeader } from "./page-header";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { LayoutTenant, LayoutUser } from "./types";

type Props = { user: LayoutUser; tenant: LayoutTenant; onOpenMenu: () => void };

export function Header({ user, tenant, onOpenMenu }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [theme, setTheme] = useState<Resolved>(() => resolveTheme(user.theme));
  const page = useCurrentPageHeader();
  const desktop = useMediaQuery(DESKTOP_HEADER_QUERY);

  // Persisted preference wins (P1-14); localStorage is only a pre-hydration cache written by applyThemeToDocument.
  useEffect(() => {
    const resolved = applyThemeToDocument(user.theme);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing the resolved SYSTEM value after mount
    setTheme(resolved);
  }, [user.theme]);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "LIGHT" : "DARK";
    setTheme(applyThemeToDocument(next));
    startTransition(async () => {
      const r = await updateThemeAction({ theme: next });
      if (!r.ok) toast.error(r.message);
    });
  };

  const otherLocaleLabel = user.locale === "ar" ? t("common.english") : t("common.arabic");
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
  const ThemeIcon = theme === "dark" ? Sun : Moon;

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:h-16 lg:gap-3 lg:bg-background/95 lg:px-6 lg:supports-[backdrop-filter]:bg-background/80"
      data-testid="app-header"
    >
      {/* Mobile: brand + page title. Desktop: tenant name. */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Button
          variant="ghost"
          size="icon"
          className="-ms-1 size-11 shrink-0 lg:hidden"
          onClick={onOpenMenu}
          aria-label={t("common.openMenu")}
          data-testid="open-menu"
        >
          <Menu className="size-5" aria-hidden="true" />
        </Button>
        <div className="min-w-0 lg:hidden" data-testid="mobile-page-title">
          {/* PageHeader hides its in-content <h1> below lg → the app bar carries the page's single h1. */}
          {page?.ownsHeading && !desktop ? (
            <h1 className="truncate text-sm leading-tight font-semibold">{page.title}</h1>
          ) : (
            <p className="truncate text-sm leading-tight font-semibold">{page?.title ?? tenant.name}</p>
          )}
          {(page?.subtitle ?? (page ? null : user.name)) && (
            <p className="truncate text-[10px] leading-tight text-muted-foreground">
              {page?.subtitle ?? user.name}
            </p>
          )}
        </div>
        <p className="hidden min-w-0 flex-1 truncate text-lg font-semibold lg:block">{tenant.name}</p>
      </div>

      <NotificationBell initialCount={user.unreadNotifications} />

      <Button
        variant="ghost"
        size="icon"
        className="hidden size-11 lg:inline-flex"
        onClick={toggleLocale}
        disabled={pending}
        aria-label={`${t("common.language")}: ${otherLocaleLabel}`}
      >
        <Languages className="size-5" aria-hidden="true" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="hidden size-11 lg:inline-flex"
        onClick={toggleTheme}
        aria-label={t("common.toggleTheme")}
        aria-pressed={theme === "light"}
      >
        <ThemeIcon className="size-5" aria-hidden="true" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-11 gap-2 px-1.5 lg:px-2"
            aria-label={user.name}
            data-testid="user-menu"
          >
            <Avatar className="size-8">
              {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
              <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="hidden max-w-40 truncate text-sm font-medium xl:inline">{user.name}</span>
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
          <DropdownMenuItem asChild className="min-h-11 gap-2">
            <Link href="/profile" data-testid="menu-profile">
              <UserIcon className="size-4" aria-hidden="true" />
              {t("nav.profile")}
            </Link>
          </DropdownMenuItem>
          {/* Mobile-only utilities (desktop shows them as header buttons) */}
          <DropdownMenuItem className="min-h-11 gap-2 lg:hidden" onSelect={toggleLocale} disabled={pending}>
            <Languages className="size-4" aria-hidden="true" />
            {t("common.language")}
            <span className="ms-auto text-xs text-muted-foreground">{otherLocaleLabel}</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11 gap-2 lg:hidden" onSelect={toggleTheme}>
            <ThemeIcon className="size-4" aria-hidden="true" />
            {t("common.toggleTheme")}
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
