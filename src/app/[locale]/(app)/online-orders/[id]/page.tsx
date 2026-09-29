import { Hourglass } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";

import { ConfirmAction } from "@/components/form/confirm-action";
import { FormField, FormSelect } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { complaintResolutions } from "@/db/schema/online-orders";
import { changeOrderStatusAction } from "@/features/online-orders/actions";
import { OrderStatusChip } from "@/features/online-orders/components/order-status-chip";
import { getOnlineOrder } from "@/features/online-orders/service";
import { transitionNeeds } from "@/features/online-orders/transitions";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";
import { variantLabel } from "@/lib/format/variant-label";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("OnlineOrders");
  return { title: t("title") };
}

/**
 * One online order (FR-ONL-03/05/06): lines, complaint and resolution,
 * status history, and a confirm dialog for each allowed next status.
 */
export default async function OnlineOrderPage({
  params,
}: PageProps<"/[locale]/online-orders/[id]">) {
  const { id } = await params;
  const session = await requirePermission("page:online-orders");
  if (!z.uuid().safeParse(id).success) notFound();
  const [t, tCommon, format, locale, order] = await Promise.all([
    getTranslations("OnlineOrders"),
    getTranslations("Common"),
    getFormatter(),
    getLocale(),
    getOnlineOrder(session, id),
  ]);
  if (!order) notFound();

  const money = (amount: number) => formatCurrency(amount, locale);
  const when = (date: Date) => format.dateTime(date, { dateStyle: "medium", timeStyle: "short" });
  const row = (label: string, value: ReactNode) => (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );

  return (
    <>
      <PageHeader
        title={order.orderCode}
        description={`${order.marketplaceName} · ${when(order.createdAt)} · ${order.createdByName}`}
        actions={
          <Button asChild variant="secondary">
            <Link href="/online-orders">{t("back")}</Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("items")}</CardTitle>
              <span className="flex flex-wrap gap-1.5">
                <OrderStatusChip status={order.status} />
                {order.held ? (
                  <Chip tone="warning" icon={<Hourglass aria-hidden="true" />}>
                    {t("held")}
                  </Chip>
                ) : null}
              </span>
            </CardHeader>
            <Table>
              <TableCaption>{t("itemsCaption")}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("item")}</TableHead>
                  <TableHead className="text-right">{t("qty")}</TableHead>
                  <TableHead className="text-right">{t("lineTotal")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="[overflow-wrap:anywhere]">
                      {variantLabel(item.nameSnapshot, item.variantSnapshot)}
                      <span className="block text-xs text-ink-muted tabular-nums">
                        {item.storePrice === null || item.storePrice === item.unitPrice
                          ? money(item.unitPrice)
                          : t("priceVsStore", {
                              price: money(item.unitPrice),
                              store: money(item.storePrice),
                            })}
                      </span>
                      {item.returnCondition ? (
                        <span className="block text-xs text-ink-muted">
                          {t(`conditions.${item.returnCondition}`)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{item.qty}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(item.lineTotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <dl className="mt-4 ml-auto flex max-w-sm flex-col gap-1 border-t border-border pt-3 text-sm">
              {row(
                t("itemsTotal"),
                <span className="tabular-nums">{money(order.itemsTotal)}</span>,
              )}
              {row(
                t("shippingFee"),
                <span className="tabular-nums">{money(order.shippingFee)}</span>,
              )}
              {order.note ? row(t("note"), order.note) : null}
              {order.complaintNote ? row(t("complaintNote"), order.complaintNote) : null}
              {order.resolution ? row(t("resolution"), t(`resolutions.${order.resolution}`)) : null}
            </dl>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("history")}</CardTitle>
            </CardHeader>
            <ol aria-label={t("history")} className="flex flex-col gap-3">
              {order.events.map((event) => (
                <li key={event.id} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
                  <span className="text-sm font-medium text-ink">
                    {event.fromStatus
                      ? t("changedTo", {
                          from: t(`statuses.${event.fromStatus}`),
                          to: t(`statuses.${event.toStatus}`),
                        })
                      : t("createdEvent")}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {`${when(event.createdAt)} · ${event.actorName}`}
                  </span>
                  {event.note ? <span className="text-sm text-ink">{event.note}</span> : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {order.next.length > 0 ? (
          <Card className="flex flex-col gap-3 self-start">
            <CardTitle>{t("nextStep")}</CardTitle>
            {order.next.map((to) => {
              const needs = transitionNeeds(order.status, to);
              return (
                <ConfirmAction
                  key={to}
                  action={changeOrderStatusAction.bind(null, order.id, order.status, to)}
                  locale={locale}
                  variant={to === "CANCELLED" ? "danger" : "secondary"}
                  labels={{
                    trigger: t(`actions.${to}`),
                    title: t("confirmTitle", { status: t(`statuses.${to}`) }),
                    description: t(`confirmDescriptions.${to}`),
                    confirm: t(`actions.${to}`),
                    cancel: tCommon("cancel"),
                    close: tCommon("close"),
                  }}
                >
                  {needs.complaintNote ? (
                    <FormField
                      name="complaintNote"
                      label={t("complaintNote")}
                      maxLength={300}
                      required
                    />
                  ) : null}
                  {needs.resolution ? (
                    <FormSelect
                      name="resolution"
                      label={t("resolution")}
                      options={complaintResolutions.map((resolution) => ({
                        value: resolution,
                        label: t(`resolutions.${resolution}`),
                      }))}
                    />
                  ) : null}
                  {needs.returnConditions
                    ? order.items.map((item) => (
                        <FormSelect
                          key={item.id}
                          name={`condition:${item.id}`}
                          label={t("conditionFor", {
                            name: variantLabel(item.nameSnapshot, item.variantSnapshot),
                            qty: item.qty,
                          })}
                          options={[
                            { value: "GOOD", label: t("conditions.GOOD") },
                            { value: "DAMAGED", label: t("conditions.DAMAGED") },
                          ]}
                        />
                      ))
                    : null}
                  <FormField name="note" label={t("eventNote")} maxLength={300} />
                </ConfirmAction>
              );
            })}
          </Card>
        ) : null}
      </div>
    </>
  );
}
