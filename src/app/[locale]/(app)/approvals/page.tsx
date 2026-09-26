import { BadgeCheck, Inbox } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { SectionTabs } from "@/components/shell/section-tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { approvalTypes } from "@/db/schema";
import { ApprovalCard } from "@/features/approvals/components/approval-card";
import {
  countPendingForViewer,
  decidableTypes,
  getInbox,
  getMyRequests,
} from "@/features/approvals/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Approvals");
  return { title: t("title") };
}

const query = z.object({
  view: z.enum(["inbox", "mine"]).optional().catch(undefined),
  type: z.enum(approvalTypes).optional().catch(undefined),
  q: z.string().trim().max(60).catch(""),
});

/**
 * Approval inbox (FR-APR-02): pending requests of the types the viewer may
 * decide, and the viewer's own requests with their outcome, as one column of
 * cards filtered by request type and requester.
 */
export default async function ApprovalsPage({ searchParams }: PageProps<"/[locale]/approvals">) {
  const session = await requirePermission("page:approvals");
  const raw = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const filters = query.parse({ view: first(raw.view), type: first(raw.type), q: first(raw.q) });
  const canDecide = decidableTypes(session).length > 0;
  const view = canDecide ? (filters.view ?? "inbox") : "mine";

  const [t, rows, pending] = await Promise.all([
    getTranslations("Approvals"),
    view === "inbox"
      ? getInbox(session, { type: filters.type, requester: filters.q })
      : getMyRequests(session, { type: filters.type }),
    countPendingForViewer(session),
  ]);
  const filtered = filters.type !== undefined || filters.q !== "";
  const href = (next: "inbox" | "mine") => ({
    pathname: "/approvals",
    query: { view: next, ...(filters.type ? { type: filters.type } : {}) },
  });

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="mx-auto flex max-w-3xl flex-col">
        {canDecide ? (
          <SectionTabs
            label={t("views")}
            current={view}
            tabs={[
              {
                id: "inbox",
                href: `/approvals?view=inbox${filters.type ? `&type=${filters.type}` : ""}`,
                label: `${t("inbox")} (${String(pending)})`,
              },
              {
                id: "mine",
                href: `/approvals?view=mine${filters.type ? `&type=${filters.type}` : ""}`,
                label: t("mine"),
              },
            ]}
          />
        ) : null}

        <Card className="mb-4">
          <form
            method="get"
            role="search"
            className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          >
            <input type="hidden" name="view" value={view} />
            <Field label={t("filterType")}>
              {(control) => (
                <Select
                  {...control}
                  name="type"
                  defaultValue={filters.type ?? ""}
                  options={[
                    { value: "", label: t("allTypes") },
                    ...approvalTypes.map((type) => ({ value: type, label: t(`types.${type}`) })),
                  ]}
                />
              )}
            </Field>
            {view === "inbox" ? (
              <Field label={t("filterRequester")}>
                {(control) => (
                  <Input
                    {...control}
                    type="search"
                    name="q"
                    defaultValue={filters.q}
                    placeholder={t("filterRequesterPlaceholder")}
                    maxLength={60}
                  />
                )}
              </Field>
            ) : (
              <span className="hidden sm:block" />
            )}
            <div className="flex gap-2">
              <Button type="submit">{t("applyFilter")}</Button>
              {filtered ? (
                <Button asChild variant="ghost">
                  <Link href={href(view)}>{t("resetFilter")}</Link>
                </Button>
              ) : null}
            </div>
          </form>
        </Card>

        <h2 className="sr-only">{view === "inbox" ? t("inbox") : t("mine")}</h2>
        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={
                view === "inbox" ? <BadgeCheck aria-hidden="true" /> : <Inbox aria-hidden="true" />
              }
              title={
                filtered ? t("emptyFiltered") : view === "inbox" ? t("emptyInbox") : t("emptyMine")
              }
            />
          </Card>
        ) : (
          <ul
            aria-label={view === "inbox" ? t("inbox") : t("mine")}
            className="flex flex-col gap-3"
          >
            {rows.map((approval) => (
              <li key={approval.id}>
                <ApprovalCard approval={approval} mode={view === "inbox" ? "decide" : "mine"} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
