import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";

import type { CapacitySnapshot } from "../service";

const tones = { ok: "success", info: "info", warning: "warning", critical: "danger" } as const;
const bars = {
  ok: "fill-primary",
  info: "fill-info-ink",
  warning: "fill-warning-ink",
  critical: "fill-danger-ink",
} as const;

/**
 * Database usage against the quota with the largest tables as housekeeping
 * hints (FR-CAP-02/04, FR-DSH-01). The bar is an SVG so it needs no inline
 * style under the nonce CSP.
 */
export async function CapacityWidget({ capacity }: { capacity: CapacitySnapshot }) {
  const [t, format, locale] = await Promise.all([
    getTranslations("Capacity"),
    getFormatter(),
    getLocale(),
  ]);
  const mb = (bytes: number) =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit: "megabyte",
      maximumFractionDigits: 1,
    }).format(bytes / (1024 * 1024));
  const width = Math.min(capacity.percent, 100);

  return (
    <Card className="mb-6 flex flex-col gap-3">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <Chip tone={tones[capacity.level]}>{t(`levels.${capacity.level}`)}</Chip>
      </CardHeader>
      <div
        role="meter"
        aria-label={t("title")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={width}
        aria-valuetext={t("usage", {
          used: mb(capacity.usedBytes),
          limit: mb(capacity.limitBytes),
          percent: capacity.percent,
        })}
      >
        <svg
          viewBox="0 0 100 4"
          preserveAspectRatio="none"
          className="h-3 w-full"
          aria-hidden="true"
        >
          <rect width="100" height="4" rx="2" className="fill-surface-muted" />
          <rect width={width} height="4" rx="2" className={bars[capacity.level]} />
        </svg>
      </div>
      <p className="text-sm text-ink tabular-nums">
        {t("usage", {
          used: mb(capacity.usedBytes),
          limit: mb(capacity.limitBytes),
          percent: capacity.percent,
        })}
      </p>
      <div>
        <h3 className="mb-1 text-sm font-semibold text-ink">{t("largestTables")}</h3>
        <ul aria-label={t("largestTables")} className="grid gap-1 text-sm sm:grid-cols-2">
          {capacity.tables.map((table) => (
            <li
              key={table.name}
              className="flex justify-between gap-3 rounded-control bg-surface-muted px-3 py-1.5"
            >
              <span className="font-mono text-xs [overflow-wrap:anywhere]">{table.name}</span>
              <span className="tabular-nums">{mb(table.bytes)}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-ink-muted">
        {t("checkedAt", { time: format.dateTime(capacity.checkedAt, { timeStyle: "short" }) })}
      </p>
    </Card>
  );
}
