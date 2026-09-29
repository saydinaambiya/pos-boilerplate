import { Landmark, QrCode } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { FormField } from "@/components/form/form-field";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createBankAccountAction } from "@/features/settings/actions";
import { SettingsForm, SettingsHeader } from "@/features/settings/components/settings-frame";
import { EditBankAccountDialog } from "@/features/settings/components/edit-dialogs";
import { ActiveChip } from "@/features/settings/components/status-chip";
import { getBankAccounts } from "@/features/settings/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { firstParam } from "@/lib/utils/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Settings");
  return { title: t("tabBankAccounts") };
}

/** Transfer destinations and the QRIS account (FR-SET-05, FR-PAY-07). */
export default async function BankAccountsPage({
  searchParams,
}: PageProps<"/[locale]/settings/bank-accounts">) {
  const session = await requirePermission("page:settings");
  const editing = firstParam((await searchParams).edit);
  const [t, accounts] = await Promise.all([getTranslations("Settings"), getBankAccounts(session)]);
  const canManage = session.permissions.has("settings:manage");

  return (
    <>
      <SettingsHeader current="bank-accounts" />
      <div className="flex flex-col gap-6">
        <Card>
          {accounts.length === 0 ? (
            <EmptyState
              icon={<Landmark aria-hidden="true" />}
              title={t("noBankAccounts")}
              description={t("noBankAccountsDescription")}
            />
          ) : (
            <Table>
              <TableCaption>{t("bankAccountsCaption")}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("bankName")}</TableHead>
                  <TableHead>{t("accountNo")}</TableHead>
                  <TableHead>{t("accountName")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">
                      {canManage ? (
                        <Link
                          href={{
                            pathname: "/settings/bank-accounts",
                            query: { edit: account.id },
                          }}
                          scroll={false}
                          aria-label={t("edit", {
                            name: `${account.bankName} ${account.accountNo}`,
                          })}
                          className="underline-offset-4 hover:underline"
                        >
                          {account.bankName}
                        </Link>
                      ) : (
                        account.bankName
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{account.accountNo}</TableCell>
                    <TableCell>{account.accountName}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-2">
                        <ActiveChip active={account.isActive} />
                        {account.isQris && account.isActive ? (
                          <Chip tone="primary" icon={<QrCode aria-hidden="true" />}>
                            {t("qrisChip")}
                          </Chip>
                        ) : null}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
        {canManage ? (
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>{t("addBankAccount")}</CardTitle>
            </CardHeader>
            <SettingsForm
              action={createBankAccountAction}
              canManage
              submitLabel={t("addBankAccount")}
            >
              <FormField name="bankName" label={t("bankName")} maxLength={60} autoComplete="off" />
              <FormField
                name="accountNo"
                label={t("accountNo")}
                inputMode="numeric"
                maxLength={30}
                autoComplete="off"
              />
              <FormField
                name="accountName"
                label={t("accountName")}
                maxLength={80}
                autoComplete="off"
              />
            </SettingsForm>
          </Card>
        ) : null}
      </div>
      {canManage && editing ? (
        <EditBankAccountDialog
          key={editing}
          session={session}
          id={editing}
          closeHref="/settings/bank-accounts"
        />
      ) : null}
    </>
  );
}
