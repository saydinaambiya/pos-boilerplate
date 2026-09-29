import { getTranslations } from "next-intl/server";

import { RouteDialog } from "@/components/ui/route-dialog";
import { endMyDeviceAction } from "@/features/devices/actions";
import { DeviceList } from "@/features/devices/components/device-list";
import { getMyDevices } from "@/features/devices/service";
import { requireSession } from "@/lib/auth/guard";

/**
 * The signed-in devices in a dialog over the current page when opened from
 * the account menu (FR-AUTH-10, ADR-0030). A reload or a shared link to
 * `/devices` renders the full page instead.
 */
export default async function DevicesModal() {
  const session = await requireSession();
  const [t, tCommon, data] = await Promise.all([
    getTranslations("Devices"),
    getTranslations("Common"),
    getMyDevices(session),
  ]);
  return (
    <RouteDialog
      closeLabel={tCommon("close")}
      size="lg"
      title={t("title")}
      description={t("description")}
    >
      <DeviceList
        data={data}
        ownerName={session.user.name}
        endAction={(sessionId) => endMyDeviceAction.bind(null, sessionId)}
      />
    </RouteDialog>
  );
}
