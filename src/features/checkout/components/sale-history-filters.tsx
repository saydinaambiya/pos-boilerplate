import { getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";

import { FilterForm } from "@/components/form/filter-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { saleStatuses } from "@/db/schema";
import { ShowArchivedField } from "@/features/housekeeping/components/show-archived-field";
import { Link } from "@/i18n/navigation";

import { saleHistoryMethods } from "../history";

interface SaleHistoryFiltersProps {
  from: string;
  to: string;
  today: string;
  query: {
    q: string;
    method?: string | undefined;
    status?: string | undefined;
    archived?: string | undefined;
  };
  /** Who sold: the cashier or the salesperson filter, for viewers who see everyone. */
  person: {
    name: string;
    label: string;
    allLabel: string;
    value?: string | undefined;
    options: readonly { id: string; name: string }[];
  } | null;
  statuses: readonly (typeof saleStatuses)[number][];
  /** Where "Reset" goes; omitted while nothing is filtered. */
  resetHref?: ComponentProps<typeof Link>["href"] | undefined;
}

/**
 * Filters of a transaction history (FR-POS-13, FR-CSG-10, FR-HK-04): store
 * days, invoice search, who sold, payment method and status, applied as
 * they change (ADR-0018).
 */
export async function SaleHistoryFilters({
  from,
  to,
  today,
  query,
  person,
  statuses,
  resetHref,
}: SaleHistoryFiltersProps) {
  const [t, tReceipt] = await Promise.all([
    getTranslations("SalesHistory"),
    getTranslations("Receipt"),
  ]);
  return (
    <Card className="mb-6">
      <FilterForm
        applyLabel={t("apply")}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
      >
        <Field label={t("from")}>
          {(control) => <DatePicker {...control} name="from" defaultValue={from} max={today} />}
        </Field>
        <Field label={t("to")}>
          {(control) => <DatePicker {...control} name="to" defaultValue={to} max={today} />}
        </Field>
        <Field label={t("invoice")}>
          {(control) => (
            <Input
              {...control}
              type="search"
              name="q"
              defaultValue={query.q}
              placeholder={t("invoicePlaceholder")}
              maxLength={40}
            />
          )}
        </Field>
        {person ? (
          <Field label={person.label}>
            {(control) => (
              <Select
                {...control}
                name={person.name}
                defaultValue={person.value ?? ""}
                options={[
                  { value: "", label: person.allLabel },
                  ...person.options.map((option) => ({ value: option.id, label: option.name })),
                ]}
              />
            )}
          </Field>
        ) : null}
        <Field label={t("method")}>
          {(control) => (
            <Select
              {...control}
              name="method"
              defaultValue={query.method ?? ""}
              options={[
                { value: "", label: t("allMethods") },
                ...saleHistoryMethods.map((method) => ({
                  value: method,
                  label: tReceipt(`methods.${method}`),
                })),
              ]}
            />
          )}
        </Field>
        <Field label={t("status")}>
          {(control) => (
            <Select
              {...control}
              name="status"
              defaultValue={query.status ?? ""}
              options={[
                { value: "", label: t("allStatuses") },
                ...statuses.map((status) => ({
                  value: status,
                  label: tReceipt(`statuses.${status}`),
                })),
              ]}
            />
          )}
        </Field>
        <ShowArchivedField checked={query.archived === "1"} />
        {resetHref ? (
          <Button asChild variant="ghost" className="self-end justify-self-start">
            <Link href={resetHref}>{t("reset")}</Link>
          </Button>
        ) : null}
      </FilterForm>
    </Card>
  );
}
