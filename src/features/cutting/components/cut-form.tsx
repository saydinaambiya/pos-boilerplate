"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";

import { useGlobalPending } from "@/components/feedback/loading-indicator";
import { useShowResult } from "@/components/feedback/result-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toneClasses } from "@/components/ui/tone";
import type { Locale } from "@/config/locales";
import {
  formatSize,
  PRODUCT_SIZES,
  type ProductSize,
  ROLL_USAGE_CM,
} from "@/features/catalog/sizes";
import { useRouter } from "@/i18n/navigation";
import { formatMeters, parseMetersToCm } from "@/lib/format/length";
import { cn } from "@/lib/utils/cn";

import { cutRollAction } from "../actions";

interface CutFormProps {
  locale: Locale;
  rollId: string;
  /** Roll length left, in cm. */
  stockCm: number;
  /** Pieces in stock per size. */
  pieces: Partial<Record<ProductSize, number>>;
  /** Defect pieces in stock per size (FR-ROL-05). */
  defectPieces: Partial<Record<ProductSize, number>>;
}

const toQty = (text: string) => {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

/**
 * Cut form (FR-ROL-03): how many meters were cut off the roll and how many
 * pieces of each size that yielded. The roll left is a preview; the server
 * refuses a cut longer than the roll. When the pieces would normally need
 * more roll than was cut, a note asks to check, without blocking. Ticking
 * "defect" books every piece of the cut as defect (FR-ROL-05).
 */
export function CutForm({ locale, rollId, stockCm, pieces, defectPieces }: CutFormProps) {
  const t = useTranslations("Cutting");
  const id = useId();
  const router = useRouter();
  const showResult = useShowResult();
  const [length, setLength] = useState("");
  const [defect, setDefect] = useState(false);
  const [quantities, setQuantities] = useState<Partial<Record<ProductSize, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idempotencyKey = useRef<string>(crypto.randomUUID());
  useGlobalPending(pending);

  const lengthCm = parseMetersToCm(length);
  const usedCm = lengthCm ?? 0;
  const lines = PRODUCT_SIZES.map((size) => ({ size, qty: toQty(quantities[size] ?? "") }));
  const expectedCm = lines.reduce((sum, line) => sum + line.qty * ROLL_USAGE_CM[line.size], 0);
  const leftCm = stockCm - usedCm;
  const tooLong = leftCm < 0;

  const submit = () => {
    if (pending) return;
    if (lengthCm === null || lengthCm <= 0) {
      setError(t("lengthMissing"));
      return;
    }
    const entered = lines.filter((line) => line.qty > 0);
    if (entered.length === 0) {
      setError(t("nothingEntered"));
      return;
    }
    if (tooLong) {
      setError(
        t("errors.insufficient", {
          needed: formatMeters(usedCm, locale),
          available: formatMeters(stockCm, locale),
        }),
      );
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await cutRollAction(locale, rollId, {
          idempotencyKey: idempotencyKey.current,
          lengthCm,
          defect,
          pieces: entered,
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        showResult?.({ status: "success", message: result.message });
        router.replace("/cutting", { scroll: false });
        router.refresh();
      } catch {
        setError(t("errors.network"));
      }
    });
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-length`} className="text-sm font-medium text-ink">
          {t("lengthLabel")}
        </label>
        <Input
          id={`${id}-length`}
          inputMode="decimal"
          value={length}
          onChange={(event) => {
            setLength(event.target.value.slice(0, 9));
          }}
          placeholder="8"
          aria-describedby={`${id}-length-hint`}
          className="max-w-40 tabular-nums"
        />
        <p id={`${id}-length-hint`} className="text-xs text-ink-muted">
          {t("lengthHint")}
        </p>
      </div>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={defect}
          onChange={(event) => {
            setDefect(event.target.checked);
          }}
          aria-describedby={`${id}-defect-hint`}
          className="mt-0.5 size-5 accent-primary"
        />
        <span>
          <span className="font-medium">{t("defectLabel")}</span>
          <span id={`${id}-defect-hint`} className="block text-xs text-ink-muted">
            {t("defectHint")}
          </span>
        </span>
      </label>
      <p className="text-sm font-medium text-ink">
        {t(defect ? "defectPiecesLabel" : "piecesLabel")}
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {PRODUCT_SIZES.map((size) => (
          <li key={size} className="grid items-center gap-2 py-3 sm:grid-cols-[1fr_7rem]">
            <label htmlFor={`${id}-${size}`} className="text-sm text-ink">
              <span className="font-medium">{formatSize(size)}</span>
              <span className="block text-xs text-ink-muted tabular-nums">
                {t(defect ? "defectInStock" : "piecesInStock", {
                  count: (defect ? defectPieces : pieces)[size] ?? 0,
                })}
              </span>
            </label>
            <Input
              id={`${id}-${size}`}
              inputMode="numeric"
              value={quantities[size] ?? ""}
              onChange={(event) => {
                const value = event.target.value.replace(/\D/g, "").slice(0, 4);
                setQuantities((current) => ({ ...current, [size]: value }));
              }}
              placeholder="0"
              className="text-center tabular-nums"
            />
          </li>
        ))}
      </ul>

      <dl
        className={cn(
          "grid grid-cols-3 gap-3 rounded-card p-4 text-sm",
          tooLong ? toneClasses.danger : "bg-surface-muted",
        )}
        aria-live="polite"
      >
        <div>
          <dt className="text-ink-muted">{t("rollNow")}</dt>
          <dd className="text-lg font-semibold tabular-nums">{formatMeters(stockCm, locale)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">{t("used")}</dt>
          <dd className="text-lg font-semibold tabular-nums">{formatMeters(usedCm, locale)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">{t("left")}</dt>
          <dd className="text-lg font-semibold tabular-nums">{formatMeters(leftCm, locale)}</dd>
        </div>
      </dl>

      {lengthCm !== null && expectedCm > lengthCm ? (
        <p className="text-sm text-ink-muted" aria-live="polite">
          {t("checkPieces", {
            expected: formatMeters(expectedCm, locale),
            length: formatMeters(lengthCm, locale),
          })}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className={cn("rounded-control px-3 py-2 text-sm", toneClasses.danger)}>
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} aria-busy={pending} className="self-start">
        {t("save")}
      </Button>
    </form>
  );
}
