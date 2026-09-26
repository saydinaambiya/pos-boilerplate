import { CalendarClock, CircleCheck, CircleOff, CircleX, Clock, Hourglass } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Chip } from "@/components/ui/chip";

import type { DisplayStatus } from "../status";

const chips = {
  PENDING_APPROVAL: { tone: "warning", icon: Clock },
  ACTIVE: { tone: "success", icon: CircleCheck },
  INACTIVE: { tone: "neutral", icon: CircleOff },
  REJECTED: { tone: "danger", icon: CircleX },
  EXPIRED: { tone: "neutral", icon: Hourglass },
  SCHEDULED: { tone: "info", icon: CalendarClock },
} as const;

/** Voucher state with an icon, never colour alone (FR-UI-05). */
export async function VoucherStatusChip({ status }: { status: DisplayStatus }) {
  const t = await getTranslations("Vouchers");
  const chip = chips[status];
  return (
    <Chip tone={chip.tone} icon={<chip.icon aria-hidden="true" />}>
      {t(`statuses.${status}`)}
    </Chip>
  );
}
