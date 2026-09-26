import { CircleCheck, CircleOff, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Chip } from "@/components/ui/chip";

import type { Employee } from "../repository";

/** Account state as labelled chips; never color alone (FR-UI-05). */
export async function EmployeeStatusChips({ employee, now }: { employee: Employee; now: Date }) {
  const t = await getTranslations("Employees");
  const locked = employee.lockedUntil !== null && employee.lockedUntil > now;

  return (
    <span className="flex flex-wrap gap-1.5">
      {employee.isOwner ? (
        <Chip tone="primary" icon={<ShieldCheck aria-hidden="true" />}>
          {t("owner")}
        </Chip>
      ) : null}
      {employee.isActive ? (
        <Chip tone="success" icon={<CircleCheck aria-hidden="true" />}>
          {t("active")}
        </Chip>
      ) : (
        <Chip tone="neutral" icon={<CircleOff aria-hidden="true" />}>
          {t("inactive")}
        </Chip>
      )}
      {locked ? (
        <Chip tone="warning" icon={<Lock aria-hidden="true" />}>
          {t("locked")}
        </Chip>
      ) : null}
      {employee.mustChangePin && employee.isActive ? (
        <Chip tone="info" icon={<KeyRound aria-hidden="true" />}>
          {t("mustChangePin")}
        </Chip>
      ) : null}
    </span>
  );
}
