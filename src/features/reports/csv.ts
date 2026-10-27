/** One CSV column: header and how to read the cell from a row. */
export interface CsvColumn<Row> {
  header: string;
  value: (row: Row) => string | number | null;
}

/**
 * Quotes a cell per RFC 4180 and neutralises spreadsheet formulas: text
 * starting with `=`, `+`, `-`, `@`, tab or CR gets a leading apostrophe
 * (OWASP CSV injection). Numbers are written as they are.
 */
export function csvCell(value: string | number | null, delimiter = ","): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  const needsQuotes = safe.includes(delimiter) || /[",\r\n]/.test(safe);
  return needsQuotes ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Header line followed by one line per row, CRLF-separated. */
export function* csvLines<Row>(
  rows: Iterable<Row>,
  columns: readonly CsvColumn<Row>[],
  delimiter = ",",
) {
  yield `${columns.map((column) => csvCell(column.header, delimiter)).join(delimiter)}\r\n`;
  for (const row of rows) {
    yield `${columns.map((column) => csvCell(column.value(row), delimiter)).join(delimiter)}\r\n`;
  }
}
