import { Hourglass, PackagePlus, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { onlineOrderStatuses } from "@/db/schema/online-orders";
import {
  OrderStatusChip,
  statusChips,
} from "@/features/online-orders/components/order-status-chip";
import { onlineOrderListQuery } from "@/features/online-orders/schemas";
import { listOnlineOrders } from "@/features/online-orders/service";
import type { OnlineOrderStatus } from "@/features/online-orders/transitions";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";
import { cn } from "@/lib/utils/cn";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("OnlineOrders");
  return { title: t("title") };
}

/**
 * Online order board (FR-ONL-04, FR-ONL-07): a chip per status with its
 * count, order cards for the chosen status, code search and held markers.
 */
export default async function OnlineOrdersPage({
  searchParams,
}: PageProps<"/[locale]/online-orders">) {
  const session = await requirePermission("page:online-orders");
  const raw = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const query = onlineOrderListQuery.parse({
    status: first(raw.status),
    q: first(raw.q),
    page: first(raw.page),
  });
  const [t, format, locale, board] = await Promise.all([
    getTranslations("OnlineOrders"),
    getFormatter(),
    getLocale(),
    listOnlineOrders(session, { status: query.status, search: query.q, page: query.page }),
  ]);
  const money = (amount: number) => formatCurrency(amount, locale);
  const total = Object.values(board.counts).reduce((sum, count) => sum + count, 0);
  const href = (status: OnlineOrderStatus | undefined, page = 1) => ({
    pathname: "/online-orders",
    query: {
      ...(status ? { status } : {}),
      ...(query.q ? { q: query.q } : {}),
      ...(page > 1 ? { page: String(page) } : {}),
    },
  });
  const chipClass = (active: boolean) =>
    cn(
      "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium",
      active ? "border-primary bg-primary text-primary-ink" : "border-border text-ink",
    );

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <Button asChild>
            <Link href="/online-orders/new">
              <PackagePlus aria-hidden="true" />
              {t("add")}
            </Link>
          </Button>
        }
      />

      <nav aria-label={t("statusFilter")} className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <Link
          href={href(undefined)}
          aria-current={query.status ? undefined : "page"}
          className={chipClass(!query.status)}
        >
          {t("all")}
          <span className="tabular-nums">{total}</span>
        </Link>
        {onlineOrderStatuses.map((status) => {
          const Icon = statusChips[status].icon;
          return (
            <Link
              key={status}
              href={href(status)}
              aria-current={query.status === status ? "page" : undefined}
              className={chipClass(query.status === status)}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="whitespace-nowrap">{t(`statuses.${status}`)}</span>
              <span className="tabular-nums">{board.counts[status]}</span>
            </Link>
          );
        })}
      </nav>

      <Card className="mb-6">
        <form method="get" role="search" className="flex flex-wrap items-end gap-3">
          {query.status ? <input type="hidden" name="status" value={query.status} /> : null}
          <Field label={t("searchCode")} className="min-w-56 flex-1">
            {(control) => (
              <Input
                {...control}
                type="search"
                name="q"
                defaultValue={query.q}
                placeholder={t("searchCodePlaceholder")}
                maxLength={40}
              />
            )}
          </Field>
          <Button type="submit">{t("search")}</Button>
          {query.q ? (
            <Button asChild variant="ghost">
              <Link href={href(query.status)}>{t("reset")}</Link>
            </Button>
          ) : null}
        </form>
      </Card>

      {board.orders.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShoppingBag aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        </Card>
      ) : (
        <ul aria-label={t("listLabel")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {board.orders.map((order) => (
            <li key={order.id}>
              <Card className="flex h-full flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/online-orders/${order.id}`}
                      aria-label={t("open", { code: order.orderCode })}
                      className="font-semibold [overflow-wrap:anywhere] text-ink underline-offset-4 hover:underline"
                    >
                      {order.orderCode}
                    </Link>
                    <p className="text-xs text-ink-muted">{order.marketplaceName}</p>
                  </div>
                  <OrderStatusChip status={order.status} />
                </div>
                <p className="text-sm [overflow-wrap:anywhere] text-ink">
                  {t("itemSummary", {
                    first: order.firstItem ?? "",
                    count: order.itemCount,
                  })}
                </p>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium tabular-nums">{money(order.itemsTotal)}</span>
                  <span className="text-xs text-ink-muted">
                    {t("since", { time: format.relativeTime(order.statusChangedAt) })}
                  </span>
                </div>
                {order.held ? (
                  <Chip
                    tone="warning"
                    icon={<Hourglass aria-hidden="true" />}
                    className="self-start"
                  >
                    {t("held")}
                  </Chip>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {query.page > 1 || board.hasNextPage ? (
        <nav aria-label={t("pagination")} className="mt-4 flex items-center justify-between gap-2">
          {query.page > 1 ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={href(query.status, query.page - 1)}>{t("previous")}</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-ink-muted">{t("pageLabel", { page: query.page })}</span>
          {board.hasNextPage ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={href(query.status, query.page + 1)}>{t("next")}</Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
