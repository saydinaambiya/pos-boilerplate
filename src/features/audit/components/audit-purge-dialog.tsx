import { CircleDashed, FileCheck } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";

import { ActionForm } from "@/components/form/action-form";
import { FilterForm } from "@/components/form/filter-form";
import { FormCheckbox } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { RouteDialog } from "@/components/ui/route-dialog";
import type { Session } from "@/lib/auth/session";

import { purgeAuditAction } from "../actions";
import { getPurgeStatus, lastPurgeableDay, purgeRange } from "../service";
import { AuditDownloadButton } from "./audit-download-button";

interface AuditPurgeDialogProps {
  session: Session;
  from: string;
  to: string;
  closeHref: ComponentProps<typeof RouteDialog>["closeHref"];
}

/**
 * Deletes a past date range of the audit log in two steps: download its
 * CSV, then delete. Today can never be chosen, and the delete stays locked
 * until the range's current contents were downloaded (FR-AUD-05, ADR-0039).
 */
export async function AuditPurgeDialog({ session, from, to, closeHref }: AuditPurgeDialogProps) {
  const [t, tCommon, format, locale, lastDay] = await Promise.all([
    getTranslations("Audit"),
    getTranslations("Common"),
    getFormatter(),
    getLocale(),
    lastPurgeableDay(),
  ]);
  const range = from && to ? await purgeRange(from, to) : null;
  const status = range ? await getPurgeStatus(session, range) : null;
  /** Midday UTC keeps the calendar day in any store time zone. */
  const day = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  return (
    <RouteDialog
      closeHref={closeHref}
      closeLabel={tCommon("close")}
      size="lg"
      title={t("purgeTitle")}
      description={t("purgeDescription")}
    >
      <div className="flex flex-col gap-6">
        <FilterForm applyLabel={t("apply")} className="grid gap-4 sm:grid-cols-2 sm:items-end">
          <input type="hidden" name="purge" value="1" />
          <Field label={t("purgeFrom")}>
            {(control) => (
              <DatePicker
                {...control}
                name="purgeFrom"
                defaultValue={from}
                max={lastDay}
                clearable
              />
            )}
          </Field>
          <Field label={t("purgeTo")}>
            {(control) => (
              <DatePicker {...control} name="purgeTo" defaultValue={to} max={lastDay} clearable />
            )}
          </Field>
        </FilterForm>

        {!from || !to ? (
          <p className="text-sm text-ink-muted">{t("purgeChooseRange")}</p>
        ) : !range || !status ? (
          <p role="alert" className="text-sm text-danger-ink">
            {t("purgeErrorRange")}
          </p>
        ) : (
          <>
            <p className="text-sm text-ink">
              {t("purgeSummary", { count: status.count, from: day(range.from), to: day(range.to) })}
            </p>
            {status.count === 0 ? null : (
              <ol className="flex flex-col gap-4">
                <li className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-ink">{t("purgeStepDownload")}</p>
                  {status.exportedAt ? (
                    <Chip tone="info" icon={<FileCheck aria-hidden="true" />}>
                      {t("purgeDownloadedAt", {
                        time: format.dateTime(status.exportedAt, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }),
                      })}
                    </Chip>
                  ) : (
                    <Chip tone="neutral" icon={<CircleDashed aria-hidden="true" />}>
                      {t("purgeNotDownloaded")}
                    </Chip>
                  )}
                  <AuditDownloadButton
                    from={range.from}
                    to={range.to}
                    labels={{
                      download: t("purgeDownload"),
                      downloading: t("purgeDownloading"),
                      downloaded: t("purgeDownloaded"),
                      failed: t("purgeDownloadFailed"),
                    }}
                  />
                </li>
                <li className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-ink">{t("purgeStepDelete")}</p>
                  {status.ready ? (
                    <ActionForm
                      action={purgeAuditAction.bind(null, range.from, range.to)}
                      locale={locale}
                    >
                      <FormCheckbox
                        name="confirmed"
                        required
                        label={t("purgeConfirmCheck")}
                        hint={t("purgeConfirmDescription", {
                          from: day(range.from),
                          to: day(range.to),
                        })}
                      />
                      <SubmitButton variant="danger" className="self-start">
                        {t("purgeDelete", { count: status.count })}
                      </SubmitButton>
                    </ActionForm>
                  ) : (
                    <>
                      <Button type="button" variant="danger" disabled className="self-start">
                        {t("purgeDelete", { count: status.count })}
                      </Button>
                      <p className="text-xs text-ink-muted">
                        {status.exportedAt ? t("purgeErrorChanged") : t("purgeLocked")}
                      </p>
                    </>
                  )}
                </li>
              </ol>
            )}
          </>
        )}
      </div>
    </RouteDialog>
  );
}
