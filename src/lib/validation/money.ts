import { z } from "zod";

import { MAX_RUPIAH } from "@/lib/format/rupiah-input";

export { MAX_RUPIAH, parseRupiah } from "@/lib/format/rupiah-input";

/** Integer rupiah amount (PRD §5). */
export const rupiah = z.int().min(0).max(MAX_RUPIAH);
