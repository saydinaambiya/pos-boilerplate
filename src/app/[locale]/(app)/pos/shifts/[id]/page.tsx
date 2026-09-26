import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ShiftFigures } from "@/features/shifts/components/shift-figures";
import { getShiftReport } from "@/features/shifts/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Shifts");
  return { title: t("reportTitle") };
}

/** Shift report (FR-SHF-04); other cashiers' shifts only with `report:view`. */
export default async function ShiftReportPage({ params }: PageProps<"/[locale]/pos/shifts/[id]">) {
  const { id } = await params;
  const session = await requirePermission("page:pos");
  if (!z.uuid().safeParse(id).success) notFound();
  const [t, shift] = await Promise.all([getTranslations("Shifts"), getShiftReport(session, id)]);
  if (!shift) notFound();

  return (
    <>
      <PageHeader
        title={t("reportTitle")}
        actions={
          <Button asChild variant="secondary">
            <Link href="/pos/shifts">{t("history")}</Link>
          </Button>
        }
      />
      <Card>
        <ShiftFigures shift={shift} />
        {shift.note ? <CardDescription className="mt-6">{shift.note}</CardDescription> : null}
      </Card>
    </>
  );
}
