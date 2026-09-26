import { BadgeCheck, Inbox } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ApprovalCard } from "@/features/approvals/components/approval-card";
import { decidableTypes, getInbox, getMyRequests } from "@/features/approvals/service";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Approvals");
  return { title: t("title") };
}

/**
 * Approval inbox (FR-APR-02): pending requests of the types the viewer may
 * decide, and the viewer's own requests with their outcome.
 */
export default async function ApprovalsPage() {
  const session = await requirePermission("page:approvals");
  const [t, inbox, mine] = await Promise.all([
    getTranslations("Approvals"),
    getInbox(session),
    getMyRequests(session),
  ]);
  const canDecide = decidableTypes(session).length > 0;

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="flex flex-col gap-8">
        {canDecide ? (
          <section aria-labelledby="inbox-heading" className="flex flex-col gap-3">
            <h2 id="inbox-heading" className="text-lg font-semibold text-ink">
              {t("inbox")}
            </h2>
            {inbox.length === 0 ? (
              <Card>
                <EmptyState icon={<BadgeCheck aria-hidden="true" />} title={t("emptyInbox")} />
              </Card>
            ) : (
              <ul className="grid gap-3 lg:grid-cols-2">
                {inbox.map((approval) => (
                  <li key={approval.id}>
                    <ApprovalCard approval={approval} mode="decide" />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
        <section aria-labelledby="mine-heading" className="flex flex-col gap-3">
          <h2 id="mine-heading" className="text-lg font-semibold text-ink">
            {t("mine")}
          </h2>
          {mine.length === 0 ? (
            <Card>
              <EmptyState icon={<Inbox aria-hidden="true" />} title={t("emptyMine")} />
            </Card>
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {mine.map((approval) => (
                <li key={approval.id}>
                  <ApprovalCard approval={approval} mode="mine" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
