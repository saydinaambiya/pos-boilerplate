import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { createVoucherAction } from "@/features/vouchers/actions";
import { VoucherForm } from "@/features/vouchers/components/voucher-form";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Vouchers");
  return { title: t("newTitle") };
}

/** Propose a voucher; it goes live after approval (FR-VCH-02, BR-10). */
export default async function NewVoucherPage() {
  await requirePermission("voucher:request");
  const t = await getTranslations("Vouchers");
  return (
    <>
      <PageHeader
        title={t("newTitle")}
        description={t("subtitle")}
        actions={
          <Button asChild variant="secondary">
            <Link href="/vouchers">{t("back")}</Link>
          </Button>
        }
      />
      <Card className="max-w-2xl">
        <VoucherForm action={createVoucherAction} submitLabel={t("create")} withCode />
      </Card>
    </>
  );
}
