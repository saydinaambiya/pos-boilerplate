import { Database } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { toneClasses } from "@/components/ui/tone";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils/cn";

import type { CapacityLevel } from "../levels";

const tones = { info: "info", warning: "warning", critical: "danger" } as const;

/** Storage warning shown on every page to viewers who can archive (FR-CAP-03). */
export async function CapacityBanner({
  level,
  percent,
}: {
  level: Exclude<CapacityLevel, "ok">;
  percent: number;
}) {
  const t = await getTranslations("Capacity");
  return (
    <div
      role={level === "critical" ? "alert" : "status"}
      className={cn(
        "mb-6 flex flex-wrap items-center gap-3 rounded-card px-4 py-3 text-sm",
        toneClasses[tones[level]],
      )}
    >
      <Database className="size-5 shrink-0" aria-hidden="true" />
      <p className="flex-1">{t(`banner.${level}`, { percent })}</p>
      <Link
        href="/housekeeping"
        className="inline-flex min-h-11 items-center font-medium underline underline-offset-4"
      >
        {t("openHousekeeping")}
      </Link>
    </div>
  );
}
