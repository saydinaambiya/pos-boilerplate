import { z } from "zod";

import { permissions } from "@/config/permissions";
import { plainText } from "@/lib/validation/text";

/** Role name and its permission set (FR-RBAC-01); unknown permissions are rejected. */
export const roleInput = z
  .object({
    name: plainText(40),
    permissions: z.array(z.enum(permissions)).transform((values) => [...new Set(values)].sort()),
  })
  .strict();

export type RoleInput = z.infer<typeof roleInput>;
