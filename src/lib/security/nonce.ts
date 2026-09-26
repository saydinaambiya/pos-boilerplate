import "server-only";

import { headers } from "next/headers";

/** Per-request CSP nonce generated in `proxy.ts`. */
export async function getNonce(): Promise<string | undefined> {
  return (await headers()).get("x-nonce") ?? undefined;
}
