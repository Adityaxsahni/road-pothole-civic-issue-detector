/** RFC 4180 CSV serialisation with spreadsheet formula-injection protection. */
export function csvEscape(value: unknown): string {
  if (value == null) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);
  // Neutralise cells that spreadsheet apps would evaluate as formulas.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: Array<{ key: keyof T; header: string }>,
): string {
  const header = columns.map((c) => csvEscape(c.header)).join(",");
  const body = rows.map((row) => columns.map((c) => csvEscape(row[c.key])).join(","));
  return [header, ...body].join("\r\n") + "\r\n";
}
