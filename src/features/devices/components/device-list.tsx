import { Laptop, Smartphone } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { ConfirmAction } from "@/components/form/confirm-action";
import { Chip } from "@/components/ui/chip";
import type { FormAction } from "@/lib/validation/form-state";

import type { getMyDevices } from "../service";

type Devices = Awaited<ReturnType<typeof getMyDevices>>;

interface DeviceListProps {
  data: Devices;
  /** Server Action that ends the given session; the viewer's own device has none. */
  endAction: (sessionId: string) => FormAction;
  /** Whose devices these are, used in the confirmation text. */
  ownerName: string;
}

/**
 * Signed-in devices with a force sign-out per device (FR-AUTH-09/10). The
 * viewer's current device is marked and signs out through the account
 * menu instead.
 */
export async function DeviceList({ data, endAction, ownerName }: DeviceListProps) {
  const [t, tCommon, format, locale] = await Promise.all([
    getTranslations("Devices"),
    getTranslations("Common"),
    getFormatter(),
    getLocale(),
  ]);
  const when = (date: Date) => format.dateTime(date, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">
        {t("usage", { count: data.devices.length, max: data.maxDevices })}
      </p>
      <ul aria-label={t("listLabel")} className="flex flex-col gap-2">
        {data.devices.map((device) => {
          const name =
            [device.browser, device.os].filter(Boolean).join(" · ") || t("unknownDevice");
          const Icon = device.mobile ? Smartphone : Laptop;
          return (
            <li
              key={device.id}
              className="flex flex-wrap items-center gap-3 rounded-card border border-border p-3"
            >
              <Icon className="size-5 shrink-0 text-ink-muted" aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-2 font-medium text-ink">
                  {name}
                  {device.current ? <Chip tone="success">{t("thisDevice")}</Chip> : null}
                </span>
                <span className="text-xs text-ink-muted">
                  {t("details", {
                    signedIn: when(device.signedInAt),
                    lastSeen: when(device.lastSeenAt),
                    ip: device.ip ?? "—",
                  })}
                </span>
              </div>
              {device.current ? null : (
                <ConfirmAction
                  action={endAction(device.id)}
                  locale={locale}
                  labels={{
                    trigger: t("end"),
                    title: t("endTitle", { device: name }),
                    description: t("endDescription", { name: ownerName }),
                    confirm: t("end"),
                    cancel: tCommon("cancel"),
                    close: tCommon("close"),
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
