/**
 * `pnpm db:seed`: creates the default roles and the first owner account from
 * SEED_OWNER_* variables (see .env.example). Safe to run repeatedly.
 */
import { z } from "zod";

import { db } from "@/db/client";
import { seed } from "@/db/seed";

const input = z
  .object({
    SEED_OWNER_USERNAME: z.string().regex(/^[a-z0-9._-]{3,32}$/),
    SEED_OWNER_NAME: z.string().min(1).max(80),
    SEED_OWNER_PASSWORD: z.string().min(12).max(128),
  })
  .parse(process.env);

await seed(db, {
  owner: {
    username: input.SEED_OWNER_USERNAME,
    name: input.SEED_OWNER_NAME,
    password: input.SEED_OWNER_PASSWORD,
  },
});
await db.$client.end();
console.warn(`Seed complete. Owner username: ${input.SEED_OWNER_USERNAME}`);
