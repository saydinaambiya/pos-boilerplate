import {
  CircleCheck,
  CircleX,
  MessageSquareWarning,
  PackageCheck,
  PackageOpen,
  Truck,
  Undo2,
  Loader,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Chip } from "@/components/ui/chip";

import type { OnlineOrderStatus } from "../transitions";

export const statusChips = {
  PROCESSING: { tone: "info", icon: Loader },
  IN_TRANSIT: { tone: "info", icon: Truck },
  DELIVERED: { tone: "success", icon: PackageCheck },
  COMPLETED: { tone: "success", icon: CircleCheck },
  CANCELLED: { tone: "neutral", icon: CircleX },
  COMPLAINT: { tone: "danger", icon: MessageSquareWarning },
  RETURN_REQUESTED: { tone: "warning", icon: Undo2 },
  RETURNED: { tone: "neutral", icon: PackageOpen },
} as const;

/** Online order state with an icon, never colour alone (FR-UI-05, PRD §4.2). */
export async function OrderStatusChip({ status }: { status: OnlineOrderStatus }) {
  const t = await getTranslations("OnlineOrders");
  const chip = statusChips[status];
  return (
    <Chip tone={chip.tone} icon={<chip.icon aria-hidden="true" />}>
      {t(`statuses.${status}`)}
    </Chip>
  );
}
