import { KeyRound } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { toneClasses } from "@/components/ui/tone";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils/cn";

/** Asks a password account without recovery codes to create them, on every page (ADR-0037). */
export async function RecoveryCodesBanner() {
  const t = await getTranslations("Account");
  return (
    <div
      role="status"
      className={cn(
        "mb-6 flex flex-wrap items-center gap-3 rounded-card px-4 py-3 text-sm",
        toneClasses.warning,
      )}
    >
      <KeyRound className="size-5 shrink-0" aria-hidden="true" />
      <p className="flex-1">{t("bannerNoCodes")}</p>
      <Link
        href="/settings/account"
        className="inline-flex min-h-11 items-center font-medium underline underline-offset-4"
      >
        {t("bannerAction")}
      </Link>
    </div>
  );
}
