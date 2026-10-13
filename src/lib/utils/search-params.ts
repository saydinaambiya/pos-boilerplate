/** Search parameters as a page receives them. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** First value of a repeated search parameter. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * A page's search parameters without `drop`, e.g. to close a `RouteDialog`
 * while keeping the list's filters (ADR-0018).
 */
export function keptQuery(raw: RawSearchParams, drop: readonly string[]): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    const single = firstParam(value);
    if (single !== undefined && single !== "" && !drop.includes(name)) query[name] = single;
  }
  return query;
}

/**
 * Page of a side history paged apart from its list (`?history=`), 1 when
 * missing or invalid (FR-STK-10, FR-ROL-03).
 */
export function historyPageOf(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1;
}
