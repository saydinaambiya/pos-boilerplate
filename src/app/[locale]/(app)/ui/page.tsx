import { CheckCircle2, Clock, PackageSearch, Truck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip, CountBadge } from "@/components/ui/chip";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { env } from "@/config/env";
import { formatCurrency } from "@/lib/format/currency";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Showcase");
  return { title: t("title") };
}

const sampleOrders = [
  { code: "#93875", customer: "Tomas Miller", total: 132600 },
  { code: "#93876", customer: "Stephanie May", total: 152900 },
];

/** Component showcase for reviewing palettes and layouts; staging/local only. */
export default async function ShowcasePage({ params }: PageProps<"/[locale]/ui">) {
  if (!env.ENABLE_DIAGNOSTICS) notFound();
  const { locale } = await params;
  const [t, tCommon] = await Promise.all([getTranslations("Showcase"), getTranslations("Common")]);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("status")}</CardTitle>
          </CardHeader>
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-3 rounded-control bg-primary py-2 pr-5 pl-2 text-sm text-primary-ink">
              <CountBadge count={5} tone="neutral" />
              {t("statusNew")}
            </span>
            <span className="inline-flex items-center gap-3 rounded-control border border-border bg-surface py-2 pr-5 pl-2 text-sm">
              <CountBadge count={12} tone="warning" />
              {t("statusProcessing")}
            </span>
            <span className="inline-flex items-center gap-3 rounded-control border border-border bg-surface py-2 pr-5 pl-2 text-sm">
              <CountBadge count={10} tone="info" />
              {t("statusInTransit")}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip tone="warning" icon={<Clock aria-hidden="true" />}>
              {t("statusProcessing")}
            </Chip>
            <Chip tone="info" icon={<Truck aria-hidden="true" />}>
              {t("statusInTransit")}
            </Chip>
            <Chip tone="danger" icon={<TriangleAlert aria-hidden="true" />}>
              {t("statusComplaint")}
            </Chip>
            <Chip tone="success" icon={<CheckCircle2 aria-hidden="true" />}>
              {t("statusCompleted")}
            </Chip>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("buttons")}</CardTitle>
          </CardHeader>
          <div className="flex flex-wrap gap-2">
            <Button>{t("primary")}</Button>
            <Button variant="secondary">{t("secondary")}</Button>
            <Button variant="ghost">{t("ghost")}</Button>
            <Button variant="danger">{t("danger")}</Button>
            <Button disabled>{t("disabled")}</Button>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("form")}</CardTitle>
          </CardHeader>
          <div className="flex flex-col gap-4">
            <Field label={t("productName")} hint={t("productNameHint")}>
              {(control) => <Input {...control} maxLength={120} autoComplete="off" />}
            </Field>
            <Field label={t("price")} error={t("priceError")}>
              {(control) => <Input {...control} inputMode="numeric" />}
            </Field>
            <label className="flex items-center justify-between gap-4 text-sm">
              {t("autoAssign")}
              <Switch />
            </label>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("table")}</CardTitle>
          </CardHeader>
          <Table>
            <TableCaption>{t("tableCaption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("orderCode")}</TableHead>
                <TableHead>{t("customer")}</TableHead>
                <TableHead className="text-right">{t("total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sampleOrders.map((order) => (
                <TableRow key={order.code}>
                  <TableCell className="text-ink-muted tabular-nums">{order.code}</TableCell>
                  <TableCell>{order.customer}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(order.total, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("overlays")}</CardTitle>
          </CardHeader>
          <div className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">{t("openDialog")}</Button>
              </DialogTrigger>
              <DialogContent closeLabel={tCommon("close")}>
                <DialogTitle>{t("dialogTitle")}</DialogTitle>
                <DialogDescription>{t("dialogDescription")}</DialogDescription>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="secondary">{tCommon("cancel")}</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button>{tCommon("save")}</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">{t("openSheet")}</Button>
              </DialogTrigger>
              <DialogContent side="bottom" closeLabel={tCommon("close")}>
                <DialogTitle>{t("sheetTitle")}</DialogTitle>
                <DialogDescription>{t("sheetDescription")}</DialogDescription>
              </DialogContent>
            </Dialog>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("loadingState")}</CardTitle>
          </CardHeader>
          <div className="flex flex-col gap-3" role="status" aria-label={tCommon("loading")}>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{t("emptyState")}</CardTitle>
          </CardHeader>
          <EmptyState
            icon={<PackageSearch aria-hidden="true" />}
            title={t("emptyState")}
            description={t("subtitle")}
          />
        </Card>
      </div>
    </>
  );
}
