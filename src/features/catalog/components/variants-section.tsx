import { ChevronDown, ChevronUp, CircleCheck, CircleOff, Star } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/form/action-form";
import { FormField } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LOCALE_FIELD } from "@/i18n/form-locale";
import { Link } from "@/i18n/navigation";
import type { Session } from "@/lib/auth/session";
import { formatCurrency } from "@/lib/format/currency";

import { createVariantAction, enableVariantsAction, moveVariantAction } from "../variant-actions";
import { getVariants } from "../variant-service";
import { ColorSwatch } from "./color-swatch";
import { StockCell } from "./stock-cell";
import { VariantFields } from "./variant-fields";

interface VariantsSectionProps {
  session: Session;
  product: {
    id: string;
    sku: string;
    price: number;
    stockQty: number;
    trackStock: boolean;
    hasVariants: boolean;
  };
}

/** Colour variants of a product: enable, list, reorder and add (FR-VAR-01..08). */
export async function VariantsSection({ session, product }: VariantsSectionProps) {
  const [t, locale] = await Promise.all([getTranslations("Variants"), getLocale()]);
  const canSeeCost = session.permissions.has("product:view-cost");

  if (!product.hasVariants) {
    return (
      <Card className="max-w-2xl">
        <CardHeader className="flex-col gap-1">
          <CardTitle>{t("enableTitle")}</CardTitle>
          <CardDescription>{t("enableDescription", { stock: product.stockQty })}</CardDescription>
        </CardHeader>
        <ActionForm action={enableVariantsAction.bind(null, product.id)} locale={locale}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="colorName" label={t("colorName")} maxLength={40} />
            <FormField
              name="hex"
              label={t("hex")}
              hint={t("hexHint")}
              maxLength={7}
              spellCheck={false}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              name="sku"
              label={t("sku")}
              defaultValue={`${product.sku}-`}
              maxLength={40}
              autoCapitalize="characters"
              spellCheck={false}
            />
            <FormField
              name="minStock"
              label={t("minStock")}
              defaultValue="0"
              inputMode="numeric"
              maxLength={7}
            />
          </div>
          <SubmitButton variant="secondary" className="self-start">
            {t("enable")}
          </SubmitButton>
        </ActionForm>
      </Card>
    );
  }

  const variants = await getVariants(session, product.id);

  return (
    <Card>
      <CardHeader className="flex-col gap-1">
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <Table>
        <TableCaption>{t("listCaption")}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>{t("order")}</TableHead>
            <TableHead>{t("color")}</TableHead>
            <TableHead>{t("sku")}</TableHead>
            <TableHead className="text-right">{t("price")}</TableHead>
            <TableHead>{t("stock")}</TableHead>
            <TableHead>{t("status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {variants.map((variant, index) => {
            const name = variant.color?.name ?? variant.sku;
            return (
              <TableRow key={variant.id}>
                <TableCell>
                  <span className="flex">
                    {(["up", "down"] as const).map((direction) => (
                      <form
                        key={direction}
                        action={moveVariantAction.bind(null, product.id, variant.id, direction)}
                      >
                        <input type="hidden" name={LOCALE_FIELD} value={locale} />
                        <button
                          type="submit"
                          aria-label={t(direction === "up" ? "moveUp" : "moveDown", { name })}
                          disabled={
                            direction === "up" ? index === 0 : index === variants.length - 1
                          }
                          className="inline-flex size-11 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted disabled:opacity-30"
                        >
                          {direction === "up" ? (
                            <ChevronUp className="size-4" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="size-4" aria-hidden="true" />
                          )}
                        </button>
                      </form>
                    ))}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-3">
                    <ColorSwatch color={variant.color} />
                    <Link
                      href={{ pathname: `/products/${product.id}`, query: { variant: variant.id } }}
                      scroll={false}
                      aria-label={t("edit", { name })}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {name}
                    </Link>
                    {variant.isDefault ? (
                      <Chip tone="primary" icon={<Star aria-hidden="true" />}>
                        {t("default")}
                      </Chip>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="text-ink-muted">{variant.sku}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(variant.priceOverride ?? product.price, locale)}
                  {variant.priceOverride === null ? (
                    <span className="block text-xs text-ink-muted">{t("inherited")}</span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/stock/${variant.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    <StockCell
                      trackStock={product.trackStock}
                      stockQty={variant.stockQty}
                      minStock={variant.minStock}
                    />
                  </Link>
                </TableCell>
                <TableCell>
                  {variant.isActive ? (
                    <Chip tone="success" icon={<CircleCheck aria-hidden="true" />}>
                      {t("active")}
                    </Chip>
                  ) : (
                    <Chip tone="neutral" icon={<CircleOff aria-hidden="true" />}>
                      {t("inactive")}
                    </Chip>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="mt-6 max-w-2xl border-t border-border pt-6">
        <h3 className="mb-4 text-base font-semibold text-ink">{t("addTitle")}</h3>
        <ActionForm action={createVariantAction.bind(null, product.id)} locale={locale}>
          <VariantFields
            canSeeCost={canSeeCost}
            withInitialStock={product.trackStock && session.permissions.has("stock:adjust")}
          />
          <SubmitButton className="self-start">{t("add")}</SubmitButton>
        </ActionForm>
      </div>
    </Card>
  );
}
