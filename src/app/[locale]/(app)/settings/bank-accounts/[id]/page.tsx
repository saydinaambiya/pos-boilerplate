import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { FormField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { setBankAccountStatusAction, updateBankAccountAction } from "@/features/settings/actions";
import { RecordStatus } from "@/features/settings/components/record-status";
import { SettingsForm, SettingsHeader } from "@/features/settings/components/settings-frame";
import { getBankAccount } from "@/features/settings/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Settings");
  return { title: t("editBankAccount") };
}

/** Edit or deactivate a bank account (FR-SET-05). */
export default async function EditBankAccountPage({
  params,
}: PageProps<"/[locale]/settings/bank-accounts/[id]">) {
  const { id } = await params;
  const session = await requirePermission("settings:manage");
  if (!z.uuid().safeParse(id).success) notFound();
  const [t, account] = await Promise.all([
    getTranslations("Settings"),
    getBankAccount(session, id),
  ]);
  if (!account) notFound();

  return (
    <>
      <SettingsHeader
        current="bank-accounts"
        actions={
          <Button asChild variant="secondary">
            <Link href="/settings/bank-accounts">{t("back")}</Link>
          </Button>
        }
      />
      <div className="flex flex-col gap-6">
        <Card className="max-w-2xl">
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
        </Card>
        <RecordStatus
          name={`${account.bankName} ${account.accountNo}`}
          isActive={account.isActive}
          action={setBankAccountStatusAction.bind(null, account.id, !account.isActive)}
        />
      </div>
    </>
  );
}
