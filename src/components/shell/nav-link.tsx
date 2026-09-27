"use client";

import { Tooltip } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils/cn";

type NavLinkProps = Omit<ComponentProps<"a">, "href"> & {
  href: string;
  activeClassName?: string;
  children: ReactNode;
};

/**
 * The only client-side piece of navigation: it marks the current route.
 * Icons and labels are rendered on the server and passed in as children.
 */
export function NavLink({ href, className, activeClassName, children, ...props }: NavLinkProps) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      {...props}
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(className, active && activeClassName)}
    >
      {children}
    </Link>
  );
}

/**
 * Icon-only link of the compact rail (FR-UI-06): a square target with the
 * label in a tooltip rendered in a portal, so the scrolling rail never clips
 * it. The accessible name comes from `accessibleLabel`.
 */
export function RailNavLink({
  href,
  label,
  accessibleLabel,
  hasBadge,
  children,
}: {
  href: string;
  label: string;
  accessibleLabel: string;
  hasBadge: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip.Provider delayDuration={100}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <NavLink
            href={href}
            aria-label={accessibleLabel}
            className="relative flex size-12 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            activeClassName="bg-primary text-primary-ink hover:bg-primary hover:text-primary-ink"
          >
            {children}
            {hasBadge ? (
              <span
                aria-hidden="true"
                className="absolute top-2 right-2 size-2.5 rounded-full bg-danger-ink ring-2 ring-surface"
              />
            ) : null}
          </NavLink>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            sideOffset={10}
            className="z-50 rounded-control bg-ink px-2.5 py-1.5 text-xs font-medium text-canvas shadow-card"
          >
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
