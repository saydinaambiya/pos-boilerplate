import {
  Archive,
  BadgeCheck,
  Boxes,
  ChartColumn,
  LayoutDashboard,
  NotebookPen,
  Package,
  Palette,
  Settings,
  ShoppingCart,
  TicketPercent,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

import type messages from "@/messages/id.json";

export interface NavigationItem {
  href: `/${string}`;
  label: keyof (typeof messages)["Navigation"];
  icon: LucideIcon;
  /** Shown in the mobile bottom bar; the rest live under "More". */
  primary?: boolean;
  /** Only rendered when diagnostics are enabled (staging/local). */
  diagnostics?: boolean;
}

/**
 * Application menu. Page permissions (PRD FR-RBAC) will filter this list
 * from Milestone 1.
 */
export const navigation: readonly NavigationItem[] = [
  { href: "/", label: "dashboard", icon: LayoutDashboard, primary: true },
  { href: "/pos", label: "pos", icon: ShoppingCart, primary: true },
  { href: "/online-orders", label: "onlineOrders", icon: Truck, primary: true },
  { href: "/products", label: "products", icon: Package, primary: true },
  { href: "/stock", label: "stock", icon: Boxes },
  { href: "/employees", label: "employees", icon: Users },
  { href: "/vouchers", label: "vouchers", icon: TicketPercent },
  { href: "/kasbon", label: "kasbon", icon: NotebookPen },
  { href: "/approvals", label: "approvals", icon: BadgeCheck },
  { href: "/reports", label: "reports", icon: ChartColumn },
  { href: "/housekeeping", label: "housekeeping", icon: Archive },
  { href: "/settings", label: "settings", icon: Settings },
  { href: "/ui", label: "showcase", icon: Palette, diagnostics: true },
];
