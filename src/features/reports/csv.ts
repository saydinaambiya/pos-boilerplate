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
export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Header line followed by one line per row, CRLF-separated. */
export function* csvLines<Row>(rows: Iterable<Row>, columns: readonly CsvColumn<Row>[]) {
  yield `${columns.map((column) => csvCell(column.header)).join(",")}\r\n`;
  for (const row of rows) {
    yield `${columns.map((column) => csvCell(column.value(row))).join(",")}\r\n`;
  }
}
