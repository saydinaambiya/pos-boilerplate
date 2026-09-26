import { getLocale, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/form/action-form";
import { FormDateField, FormField, FormSelect } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import type { FormAction } from "@/lib/validation/form-state";

interface VoucherFormProps {
  action: FormAction;
  submitLabel: string;
  /** Codes are fixed once created, so the field only appears for new vouchers. */
  withCode: boolean;
  defaults?: {
    name: string;
    type: "PERCENT" | "FIXED";
    value: string;
    minPurchase: string;
    maxDiscount: string;
    startDate: string;
    endDate: string;
    quota: string;
  };
}

/** Voucher terms form shared by "new voucher" and "revise" (FR-VCH-01). */
export async function VoucherForm({ action, submitLabel, withCode, defaults }: VoucherFormProps) {
  const [t, locale] = await Promise.all([getTranslations("Vouchers"), getLocale()]);
  const money = { money: true, maxLength: 20 } as const;
  return (
    <ActionForm action={action} locale={locale}>
      {withCode ? (
        <FormField
          name="code"
          label={t("code")}
          hint={t("codeHint")}
          maxLength={20}
          autoCapitalize="characters"
          spellCheck={false}
          autoComplete="off"
        />
      ) : null}
      <FormField name="name" label={t("name")} defaultValue={defaults?.name} maxLength={60} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormSelect
          name="type"
          label={t("type")}
          defaultValue={defaults?.type ?? "PERCENT"}
          options={[
            { value: "PERCENT", label: t("typePercent") },
            { value: "FIXED", label: t("typeFixed") },
          ]}
        />
        <FormField
          name="value"
          label={t("value")}
          hint={t("valueHint")}
          defaultValue={defaults?.value}
          {...money}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          name="minPurchase"
          label={t("minPurchase")}
          hint={t("optionalHint")}
          defaultValue={defaults?.minPurchase}
          {...money}
        />
        <FormField
          name="maxDiscount"
          label={t("maxDiscount")}
          hint={t("maxDiscountHint")}
          defaultValue={defaults?.maxDiscount}
          {...money}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormDateField
          name="startDate"
          label={t("startDate")}
          hint={t("periodHint")}
          clearable
          defaultValue={defaults?.startDate}
        />
        <FormDateField
          name="endDate"
          label={t("endDate")}
          clearable
          defaultValue={defaults?.endDate}
        />
      </div>
      <FormField
        name="quota"
        label={t("quota")}
        hint={t("quotaHint")}
        defaultValue={defaults?.quota}
        inputMode="numeric"
        maxLength={7}
        className="max-w-40"
      />
      <SubmitButton className="self-start">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
