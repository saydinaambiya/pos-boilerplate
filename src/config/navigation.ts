import {
  Archive,
  Backpack,
  BadgeCheck,
  Boxes,
  ChartColumn,
  House,
  LayoutDashboard,
  NotebookPen,
  Package,
  Palette,
  Scissors,
  ScrollText,
  Settings,
  ShoppingCart,
  TicketPercent,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { Permission } from "@/config/permissions";
import type messages from "@/messages/id.json";

export interface NavigationItem {
  href: `/${string}`;
  label: keyof (typeof messages)["Navigation"];
  icon: LucideIcon;
  /** Shown in the mobile bottom bar; the rest live under "More". */
  primary?: boolean;
  /** Only rendered when diagnostics are enabled (staging/local). */
  diagnostics?: boolean;
  /** Page permission that shows the entry and guards the route (PRD §2.2). */
  permission?: Permission;
}

/** Application menu, filtered by the viewer's page permissions (FR-RBAC-02). */
export const navigation: readonly NavigationItem[] = [
  /** Home for every signed-in account, whatever its role (ADR-0028). */
  { href: "/", label: "home", icon: House, primary: true },
  {
    href: "/dashboard",
    label: "dashboard",
    icon: LayoutDashboard,
    permission: "page:dashboard",
  },
  { href: "/pos", label: "pos", icon: ShoppingCart, primary: true, permission: "page:pos" },
  {
    href: "/online-orders",
    label: "onlineOrders",
    icon: Truck,
    primary: true,
    permission: "page:online-orders",
  },
  {
    href: "/consignments",
    label: "consignments",
    icon: Backpack,
    permission: "page:consignments",
  },
  {
    href: "/products",
    label: "products",
    icon: Package,
    primary: true,
    permission: "page:products",
  },
  { href: "/stock", label: "stock", icon: Boxes, permission: "page:stock" },
  { href: "/cutting", label: "cutting", icon: Scissors, permission: "page:cutting" },
  { href: "/employees", label: "employees", icon: Users, permission: "page:employees" },
  { href: "/vouchers", label: "vouchers", icon: TicketPercent, permission: "page:vouchers" },
  { href: "/kasbon", label: "kasbon", icon: NotebookPen, permission: "page:kasbon" },
  { href: "/expenses", label: "expenses", icon: Wallet, permission: "page:expenses" },
  { href: "/approvals", label: "approvals", icon: BadgeCheck, permission: "page:approvals" },
  { href: "/reports", label: "reports", icon: ChartColumn, permission: "page:reports" },
  { href: "/housekeeping", label: "housekeeping", icon: Archive, permission: "page:housekeeping" },
  { href: "/audit", label: "audit", icon: ScrollText, permission: "page:audit" },
  { href: "/settings", label: "settings", icon: Settings, permission: "page:settings" },
  { href: "/ui", label: "showcase", icon: Palette, diagnostics: true },
];
