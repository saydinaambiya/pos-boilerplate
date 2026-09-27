import { getLocale, getTranslations } from "next-intl/server";

import { ConfirmAction } from "@/components/form/confirm-action";
import { DialogSection } from "@/components/ui/dialog";
import type { FormAction } from "@/lib/validation/form-state";

interface RecordStatusProps {
  name: string;
  isActive: boolean;
  /** Bound action that flips the status. */
  action: FormAction;
}

/** Status section of an edit dialog with a confirmed activate/deactivate action (FR-UX-04). */
export async function RecordStatus({ name, isActive, action }: RecordStatusProps) {
  const [t, tCommon, locale] = await Promise.all([
    getTranslations("Settings"),
    getTranslations("Common"),
    getLocale(),
  ]);
  return (
    <DialogSection
      title={t("statusSection")}
      description={isActive ? t("statusActive") : t("statusInactive")}
    >
      <div>
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
      </div>
    </DialogSection>
  );
}
