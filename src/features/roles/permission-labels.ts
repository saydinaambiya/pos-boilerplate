import "server-only";

import { getTranslations } from "next-intl/server";

import { type PermissionGroup, permissionGroups, permissionMessageKey } from "@/config/permissions";
import type messages from "@/messages/id.json";

type LabelKey = keyof (typeof messages)["Permissions"]["labels"];

/** Translated permission matrix sections for the current locale. */
export async function permissionMatrixGroups() {
  const t = await getTranslations("Permissions");
  return (Object.keys(permissionGroups) as PermissionGroup[]).map((group) => ({
    id: group,
    label: t(`groups.${group}`),
    permissions: permissionGroups[group].map((permission) => ({
      value: permission,
      label: t(`labels.${permissionMessageKey(permission) as LabelKey}`),
    })),
  }));
}
