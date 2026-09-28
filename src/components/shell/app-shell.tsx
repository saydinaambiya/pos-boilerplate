import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { appConfig } from "@/config/app.config";
import { layouts } from "@/config/layouts";
import { navigation, type NavigationItem } from "@/config/navigation";
import type { Permission } from "@/config/permissions";
import { cn } from "@/lib/utils/cn";

import { AccountMenu } from "./account-menu";
import { BrandLogo } from "./brand-logo";
import { MoreMenu } from "./more-menu";
import { NavLink, RailNavLink } from "./nav-link";
import { Preferences } from "./preferences";

const layout = layouts[appConfig.appearance.layout];

interface AppShellProps {
  showDiagnostics: boolean;
  /** Viewer's permissions; menu entries without access are hidden (FR-RBAC-02). */
  permissions: ReadonlySet<Permission>;
  /** Counts shown next to menu entries, keyed by href, e.g. pending approvals (FR-APR-02). */
  badges?: Partial<Record<string, number>>;
  children: ReactNode;
}

/**
 * Application frame for the layout preset chosen in `app.config.ts`
 * (PRD FR-UI-06, FR-UX-01). Desktop navigation and the mobile variant are
 * both rendered and toggled with CSS breakpoints, so no client script
 * decides the layout.
 */
export async function AppShell({
  showDiagnostics,
  permissions,
  badges = {},
  children,
}: AppShellProps) {
  const [t, tCommon] = await Promise.all([
    getTranslations("Navigation"),
    getTranslations("Common"),
  ]);
  const items = navigation.filter(
    (item) =>
      (showDiagnostics || !item.diagnostics) &&
      (item.permission === undefined || permissions.has(item.permission)),
  );
  const badgeCount = (item: NavigationItem) => badges[item.href] ?? 0;
  const label = (item: NavigationItem) => t(item.label);
  /** Name including the count, for icon-only links where the badge text is not rendered. */
  const accessibleLabel = (item: NavigationItem) => {
    const count = badgeCount(item);
    return count > 0 ? `${label(item)}, ${t("badge", { count })}` : label(item);
  };
  const badge = (item: NavigationItem) => {
    const count = badgeCount(item);
    return count > 0 ? (
      <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-xs font-semibold text-danger-ink tabular-nums">
        <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
        <span className="sr-only">{t("badge", { count })}</span>
      </span>
    ) : null;
  };

  const verticalLinks = (compact: boolean) =>
    compact ? (
      <ul className="flex flex-col items-center gap-2">
        {items.map((item) => (
          <li key={item.href}>
            <RailNavLink
              href={item.href}
              label={label(item)}
              accessibleLabel={accessibleLabel(item)}
              hasBadge={badgeCount(item) > 0}
            >
              <item.icon className="size-5 shrink-0" aria-hidden="true" />
            </RailNavLink>
          </li>
        ))}
      </ul>
    ) : (
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.href}>
            <NavLink
              href={item.href}
              className="flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
              activeClassName="bg-primary text-primary-ink hover:bg-primary hover:text-primary-ink"
            >
              <item.icon className="size-5 shrink-0" aria-hidden="true" />
              <span>{label(item)}</span>
              {badge(item)}
            </NavLink>
          </li>
        ))}
      </ul>
    );

  const skipLink = (
    <a
      href="#main"
      className="sr-only z-50 rounded-control bg-primary px-4 py-2 text-primary-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      {tCommon("skipToContent")}
    </a>
  );

  const mobileHeader = (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2 md:hidden">
      <BrandLogo className="h-8" />
      {layout.mobile === "drawer" ? (
        <MoreMenu
          label={t("more")}
          closeLabel={tCommon("close")}
          triggerClassName="text-ink inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-medium hover:bg-surface-muted"
        >
          {verticalLinks(false)}
          <Preferences variant="stacked" className="mt-6" />
        </MoreMenu>
      ) : null}
    </header>
  );

  const mobileBottomBar =
    layout.mobile === "bottom-bar" ? (
      <nav
        aria-label={t("label")}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-5">
          {items
            .filter((item) => item.primary)
            .map((item) => (
              <li key={item.href}>
                <NavLink
                  href={item.href}
                  className="group flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink-muted"
                  activeClassName="text-ink"
                >
                  <span className="flex h-7 w-12 items-center justify-center rounded-full group-aria-[current=page]:bg-primary group-aria-[current=page]:text-primary-ink">
                    <item.icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="max-w-full truncate px-1">{label(item)}</span>
                </NavLink>
              </li>
            ))}
          <li>
            <MoreMenu
              label={t("more")}
              closeLabel={tCommon("close")}
              triggerClassName="text-ink-muted flex min-h-14 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium [&_svg]:my-1"
            >
              {verticalLinks(false)}
              <Preferences variant="stacked" className="mt-6" />
            </MoreMenu>
          </li>
        </ul>
      </nav>
    ) : null;

  const main = (
    <main
      id="main"
      tabIndex={-1}
      className={cn(
        "min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8",
        layout.mobile === "bottom-bar" && "pb-24 md:pb-8",
      )}
    >
      {children}
    </main>
  );

  if (layout.navigation === "topbar") {
    return (
      <div className="flex min-h-dvh flex-col">
        {skipLink}
        {mobileHeader}
        <header className="sticky top-0 z-30 hidden items-center gap-6 border-b border-border bg-surface px-6 py-3 md:flex">
          <BrandLogo className="h-9 shrink-0" />
          <nav aria-label={t("label")} className="min-w-0 flex-1 overflow-x-auto">
            <ul className="flex gap-1">
              {items.map((item) => (
                <li key={item.href}>
                  <NavLink
                    href={item.href}
                    className="flex min-h-10 items-center gap-2 rounded-control px-3 text-sm font-medium whitespace-nowrap text-ink-muted hover:bg-surface-muted hover:text-ink"
                    activeClassName="bg-primary text-primary-ink hover:bg-primary hover:text-primary-ink"
                  >
                    <item.icon className="size-4" aria-hidden="true" />
                    <span>{label(item)}</span>
                    {badge(item)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <Preferences className="shrink-0" />
        </header>
        {main}
        {mobileBottomBar}
      </div>
    );
  }

  const compact = layout.navigation === "rail";

  return (
    <div className="flex min-h-dvh">
      {skipLink}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col gap-8 overflow-y-auto bg-surface py-6 md:flex",
          compact ? "w-20 items-center px-3" : "w-64 px-4 lg:w-72 lg:px-5",
        )}
      >
        {compact ? (
          <BrandLogo variant="mark" />
        ) : (
          <div className="flex flex-col gap-4">
            <BrandLogo className="px-2" />
            <AccountMenu variant="card" />
          </div>
        )}
        <nav aria-label={t("label")} className={cn("flex-1", compact && "w-full")}>
          {verticalLinks(compact)}
        </nav>
        {compact ? null : <Preferences variant="stacked" account={false} />}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {mobileHeader}
        {compact ? (
          <div className="hidden justify-end px-10 pt-6 md:flex">
            <Preferences />
          </div>
        ) : null}
        {main}
      </div>
      {mobileBottomBar}
    </div>
  );
}
