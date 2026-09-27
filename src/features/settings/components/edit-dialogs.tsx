import { getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";
import { z } from "zod";

import { FormField } from "@/components/form/form-field";
import { RouteDialog } from "@/components/ui/route-dialog";
import type { Session } from "@/lib/auth/session";

import {
  setBankAccountStatusAction,
  setMarketplaceStatusAction,
  updateBankAccountAction,
  updateMarketplaceAction,
} from "../actions";
import { getBankAccount, getMarketplace } from "../service";
import { RecordStatus } from "./record-status";
import { SettingsForm } from "./settings-frame";

interface EditDialogProps {
  session: Session;
  id: string;
  closeHref: ComponentProps<typeof RouteDialog>["closeHref"];
}

/** Edit or deactivate a bank account in a dialog (FR-SET-05, ADR-0018). */
export async function EditBankAccountDialog({ session, id, closeHref }: EditDialogProps) {
  if (!z.uuid().safeParse(id).success) return null;
  const [t, tCommon, account] = await Promise.all([
    getTranslations("Settings"),
    getTranslations("Common"),
    getBankAccount(session, id),
  ]);
  if (!account) return null;

  return (
    <RouteDialog closeHref={closeHref} closeLabel={tCommon("close")} title={t("editBankAccount")}>
      <SettingsForm action={updateBankAccountAction.bind(null, account.id)} canManage>
        <FormField
          name="bankName"
          label={t("bankName")}
          defaultValue={account.bankName}
          maxLength={60}
        />
        <FormField
          name="accountNo"
          label={t("accountNo")}
          defaultValue={account.accountNo}
          inputMode="numeric"
          maxLength={30}
        />
        <FormField
          name="accountName"
          label={t("accountName")}
          defaultValue={account.accountName}
          maxLength={80}
        />
      </SettingsForm>
      <RecordStatus
        name={`${account.bankName} ${account.accountNo}`}
        isActive={account.isActive}
        action={setBankAccountStatusAction.bind(null, account.id, !account.isActive)}
      />
    </RouteDialog>
  );
}

/** Rename or deactivate a marketplace in a dialog (FR-SET-06, ADR-0018). */
export async function EditMarketplaceDialog({ session, id, closeHref }: EditDialogProps) {
  if (!z.uuid().safeParse(id).success) return null;
  const [t, tCommon, marketplace] = await Promise.all([
    getTranslations("Settings"),
    getTranslations("Common"),
    getMarketplace(session, id),
  ]);
  if (!marketplace) return null;

  return (
    <RouteDialog closeHref={closeHref} closeLabel={tCommon("close")} title={t("editMarketplace")}>
      <SettingsForm action={updateMarketplaceAction.bind(null, marketplace.id)} canManage>
        <FormField
          name="name"
          label={t("marketplaceName")}
          defaultValue={marketplace.name}
          maxLength={40}
        />
      </SettingsForm>
      <RecordStatus
        name={marketplace.name}
        isActive={marketplace.isActive}
        action={setMarketplaceStatusAction.bind(null, marketplace.id, !marketplace.isActive)}
      />
    </RouteDialog>
  );
}
