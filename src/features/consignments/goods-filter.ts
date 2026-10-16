/** What a consignment line carries that a search can match (FR-CSG-11). */
interface SearchableGoods {
  name: string;
  variantName: string | null;
  brandName: string | null;
  motif: string | null;
  colorName: string | null;
}

/** A dated batch of the goods history with the fields a search can match (FR-CSG-11). */
interface SearchableBatch<Item extends SearchableGoods> {
  actorName: string;
  invoiceNo: string | null;
  note: string | null;
  items: Item[];
}

/** Lower-cased words of a search, empty when nothing was typed. */
function wordsOf(search: string): string[] {
  return search.toLocaleLowerCase("id").split(/\s+/).filter(Boolean);
}

function hasEvery(words: readonly string[], fields: readonly (string | null)[]): boolean {
  const text = fields.filter(Boolean).join(" ").toLocaleLowerCase("id");
  return words.every((word) => text.includes(word));
}

/**
 * Whether goods match a search typed on a salesperson's page (FR-CSG-11):
 * every word must appear in the brand, name, motif, colour or variant, in
 * any order and case.
 */
export function matchesGoods(goods: SearchableGoods, search: string): boolean {
  return hasEvery(wordsOf(search), [
    goods.brandName,
    goods.name,
    goods.motif,
    goods.colorName,
    goods.variantName,
  ]);
}

/**
 * The goods history narrowed to a search (FR-CSG-11): a batch whose invoice
 * number, recorder or note matches stays whole, otherwise only its matching
 * lines stay, and batches left without lines drop out.
 */
export function searchBatches<Item extends SearchableGoods, Batch extends SearchableBatch<Item>>(
  batches: readonly Batch[],
  search: string,
): Batch[] {
  const words = wordsOf(search);
  if (words.length === 0) return [...batches];
  return batches.flatMap((batch) => {
    if (hasEvery(words, [batch.invoiceNo, batch.actorName, batch.note])) return [batch];
    const items = batch.items.filter((item) => matchesGoods(item, search));
    return items.length > 0 ? [{ ...batch, items }] : [];
  });
}
