// CSV serialization with protection against spreadsheet formula injection:
// a text cell starting with = + - @ (or tab/CR) is prefixed with a single quote so
// Excel/Sheets treat it as text, not a formula.
function csvCell(value) {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(headers.map((h) => csvCell(row[h])).join(","));
  return lines.join("\r\n") + "\r\n";
}

module.exports = { csvCell, toCsv };
