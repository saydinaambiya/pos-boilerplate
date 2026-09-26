import { CircleCheck, CircleOff } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Chip } from "@/components/ui/chip";

/** Active/inactive with an icon, never color alone (FR-UI-05). */
export async function ActiveChip({ active }: { active: boolean }) {
  const t = await getTranslations("Settings");
  return active ? (
    <Chip tone="success" icon={<CircleCheck aria-hidden="true" />}>
      {t("active")}
    </Chip>
  ) : (
    <Chip tone="neutral" icon={<CircleOff aria-hidden="true" />}>
      {t("inactive")}
    </Chip>
  );
}
