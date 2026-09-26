"use client";

import type { ReactNode } from "react";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils/cn";

interface NavLinkProps {
  href: string;
  className?: string;
  activeClassName?: string;
  /** Accessible name when the visible label is hidden (compact layout). */
  "aria-label"?: string;
  children: ReactNode;
}

/**
 * The only client-side piece of navigation: it marks the current route.
 * Icons and labels are rendered on the server and passed in as children.
 */
export function NavLink({ href, className, activeClassName, children, ...props }: NavLinkProps) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(className, active && activeClassName)}
      {...props}
    >
      {children}
    </Link>
  );
}
