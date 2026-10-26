import { AlarmClock, CalendarClock, CircleCheck, CircleDashed, Clock } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Chip } from "@/components/ui/chip";
import type { purchaseStatuses } from "@/db/schema";
import type { DueState } from "@/lib/format/due";

const statusChips = {
  OPEN: { tone: "warning", icon: Clock, key: "OPEN" },
  PARTIALLY_PAID: { tone: "info", icon: CircleDashed, key: "PARTIALLY_PAID" },
  SETTLED: { tone: "success", icon: CircleCheck, key: "SETTLED" },
} as const;

/** Bill state (lunas/cicil) with an icon, never colour alone (FR-UI-05, FR-PRB-02). */
export async function PurchaseStatusChip({
  status,
}: {
  status: (typeof purchaseStatuses)[number];
}) {
  const t = await getTranslations("Purchases");
  const chip = statusChips[status];
  return (
    <Chip tone={chip.tone} icon={<chip.icon aria-hidden="true" />}>
      {t(`statuses.${chip.key}`)}
    </Chip>
  );
}

/** Due-date marker: overdue, due today, or the upcoming date (FR-PRB-04). */
export async function PurchaseDueMarker({
  due,
  dueDate,
}: {
  due: DueState;
  dueDate: string | null;
}) {
  const [t, format] = await Promise.all([getTranslations("Purchases"), getFormatter()]);
  if (!dueDate) return <span className="text-sm text-ink-muted">—</span>;
  const date = format.dateTime(new Date(`${dueDate}T00:00:00Z`), {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  if (due === "none") return <span className="text-sm text-ink-muted">{date}</span>;
  if (due === "overdue") {
    return (
      <Chip tone="danger" icon={<AlarmClock aria-hidden="true" />}>
        {t("overdue", { date })}
      </Chip>
    );
  }
  if (due === "today") {
    return (
      <Chip tone="warning" icon={<AlarmClock aria-hidden="true" />}>
        {t("dueToday")}
      </Chip>
    );
  }
  return (
    <Chip tone="neutral" icon={<CalendarClock aria-hidden="true" />}>
      {t("dueOn", { date })}
    </Chip>
  );
}
