import { AlarmClock, CalendarClock, CircleCheck, CircleDashed, Clock } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Chip } from "@/components/ui/chip";
import type { kasbonStatuses } from "@/db/schema";

import type { DueState } from "../aging";

const statusChips = {
  OPEN: { tone: "warning", icon: Clock },
  PARTIALLY_PAID: { tone: "info", icon: CircleDashed },
  SETTLED: { tone: "success", icon: CircleCheck },
} as const;

/** Store credit state with an icon, never colour alone (FR-UI-05, PRD §4.3). */
export async function KasbonStatusChip({ status }: { status: (typeof kasbonStatuses)[number] }) {
  const t = await getTranslations("Kasbon");
  const chip = statusChips[status];
  return (
    <Chip tone={chip.tone} icon={<chip.icon aria-hidden="true" />}>
      {t(`statuses.${status}`)}
    </Chip>
  );
}

/** Due-date marker: overdue, due today, or the upcoming date (FR-KSB-06). */
export async function DueMarker({ due, dueDate }: { due: DueState; dueDate: string | null }) {
  const [t, format] = await Promise.all([getTranslations("Kasbon"), getFormatter()]);
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
