import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { endMyDeviceAction } from "@/features/devices/actions";
import { DeviceList } from "@/features/devices/components/device-list";
import { getMyDevices } from "@/features/devices/service";
import { requireSession } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Devices");
  return { title: t("title") };
}

/** The viewer's signed-in devices, with a sign-out per device (FR-AUTH-09/10). */
export default async function DevicesPage() {
  const session = await requireSession();
  const [t, data] = await Promise.all([getTranslations("Devices"), getMyDevices(session)]);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Card className="max-w-3xl">
        <DeviceList
          data={data}
          ownerName={session.user.name}
          endAction={(sessionId) => endMyDeviceAction.bind(null, sessionId)}
        />
      </Card>
    </>
  );
}
