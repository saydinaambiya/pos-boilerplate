import { CircleCheck, CircleX, NotebookPen, ReceiptText } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Link } from "@/i18n/navigation";
import { formatCurrency } from "@/lib/format/currency";

import { saleHistoryMethods } from "../history";
import type { querySales } from "../repository";

type Href = ComponentProps<typeof Link>["href"];
type SaleRow = Awaited<ReturnType<typeof querySales>>[number];

const statusChips = {
  COMPLETED: { tone: "success", icon: CircleCheck },
  COMPLETED_WITH_KASBON: { tone: "info", icon: NotebookPen },
  VOIDED: { tone: "danger", icon: CircleX },
} as const;

interface SaleHistoryTableProps {
  sales: readonly SaleRow[];
  summary: { count: number; total: number; voided: number };
  page: number;
  hasNextPage: boolean;
  /** Column naming who sold, for viewers who see everyone's sales. */
  person: { label: string; nameOf: (sale: SaleRow) => string } | null;
  /** Opens one sale in a dialog over the list (ADR-0018). */
  viewHref: (saleId: string) => Href;
  pageHref: (page: number) => Href;
}

/**
 * Results of a transaction history (FR-POS-13, FR-CSG-10): count and total,
 * then per sale its invoice and buyer, time, who sold, payment methods with
 * the transfer bank, total and status, paged.
 */
export async function SaleHistoryTable({
  sales,
  summary,
  page,
  hasNextPage,
  person,
  viewHref,
  pageHref,
}: SaleHistoryTableProps) {
  const [t, tReceipt, format, locale] = await Promise.all([
    getTranslations("SalesHistory"),
    getTranslations("Receipt"),
    getFormatter(),
    getLocale(),
  ]);
  const money = (amount: number) => formatCurrency(amount, locale);

  return (
    <>
      <p role="status" className="mb-3 text-sm text-ink-muted">
        {t("summary", {
          count: summary.count,
          total: money(summary.total),
          voided: summary.voided,
        })}
      </p>

      <Card>
        {sales.length === 0 ? (
          <EmptyState
            icon={<ReceiptText aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        ) : (
          <Table>
            <TableCaption>{t("caption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("invoice")}</TableHead>
                <TableHead>{t("time")}</TableHead>
                {person ? <TableHead>{person.label}</TableHead> : null}
                <TableHead>{t("method")}</TableHead>
                <TableHead className="text-right">{t("total")}</TableHead>
                <TableHead>{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((sale) => {
                const chip = statusChips[sale.status];
                return (
                  <TableRow key={sale.id}>
                    <TableCell className="font-medium tabular-nums">
                      <Link
                        href={viewHref(sale.id)}
                        scroll={false}
                        aria-label={t("open", { invoiceNo: sale.invoiceNo })}
                        className="underline-offset-4 hover:underline"
                      >
                        {sale.invoiceNo}
                      </Link>
                      {sale.customerName ? (
                        <span className="block text-xs font-normal text-ink-muted">
                          {sale.customerName}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {format.dateTime(sale.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                    </TableCell>
                    {person ? (
                      <TableCell className="text-sm">{person.nameOf(sale)}</TableCell>
                    ) : null}
                    <TableCell className="text-sm">
                      {sale.methods
                        .map((method) =>
                          (saleHistoryMethods as readonly string[]).includes(method)
                            ? tReceipt(`methods.${method as (typeof saleHistoryMethods)[number]}`)
                            : method,
                        )
                        .join(" + ")}
                      {sale.transferBanks.length > 0 ? (
                        <span className="block text-xs text-ink-muted">
                          {sale.transferBanks.join(", ")}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(sale.grandTotal)}
                    </TableCell>
                    <TableCell>
                      <Chip tone={chip.tone} icon={<chip.icon aria-hidden="true" />}>
                        {tReceipt(`statuses.${sale.status}`)}
                      </Chip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {page > 1 || hasNextPage ? (
          <nav
            aria-label={t("pagination")}
            className="mt-4 flex items-center justify-between gap-2"
          >
            {page > 1 ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={pageHref(page - 1)}>{t("previous")}</Link>
              </Button>
            ) : (
              <span />
            )}
            <span className="text-sm text-ink-muted">{t("pageLabel", { page })}</span>
            {hasNextPage ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={pageHref(page + 1)}>{t("next")}</Link>
              </Button>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </Card>
    </>
  );
}
