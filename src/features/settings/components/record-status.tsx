import { getLocale, getTranslations } from "next-intl/server";

import { ConfirmAction } from "@/components/form/confirm-action";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FormAction } from "@/lib/validation/form-state";

interface RecordStatusProps {
  name: string;
  isActive: boolean;
  /** Bound action that flips the status. */
  action: FormAction;
}

/** Status card with a confirmed activate/deactivate action (FR-UX-04). */
export async function RecordStatus({ name, isActive, action }: RecordStatusProps) {
  const [t, tCommon, locale] = await Promise.all([
    getTranslations("Settings"),
    getTranslations("Common"),
    getLocale(),
  ]);
  return (
    <Card className="max-w-2xl">
      <CardHeader className="flex-col gap-1">
        <CardTitle>{t("statusSection")}</CardTitle>
        <CardDescription>{isActive ? t("statusActive") : t("statusInactive")}</CardDescription>
      </CardHeader>
      <ConfirmAction
        action={action}
        locale={locale}
        variant={isActive ? "danger" : "secondary"}
        labels={{
          trigger: isActive ? t("deactivate") : t("activate"),
          title: isActive ? t("deactivateTitle", { name }) : t("activateTitle", { name }),
          description: isActive ? t("deactivateDescription") : t("activateDescription"),
          confirm: isActive ? t("deactivate") : t("activate"),
          cancel: tCommon("cancel"),
          close: tCommon("close"),
        }}
      />
    </Card>
  );
}
