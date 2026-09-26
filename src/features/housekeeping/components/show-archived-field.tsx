import { getTranslations } from "next-intl/server";

/** GET-form checkbox that brings archived rows back into a list (FR-HK-04). */
export async function ShowArchivedField({ checked }: { checked: boolean }) {
  const t = await getTranslations("Housekeeping");
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-ink">
      <input
        type="checkbox"
        name="archived"
        value="1"
        defaultChecked={checked}
        className="size-5 shrink-0 accent-primary"
      />
      {t("showArchived")}
    </label>
  );
}
