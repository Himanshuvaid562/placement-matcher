const { csvCell, toCsv } = require("../src/utils/csv");

describe("csv", () => {
  test("neutralizes spreadsheet formula injection in text cells", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  test("does not mangle negative numbers", () => {
    expect(csvCell(-3)).toBe("-3");
  });

  test("quotes cells containing commas, quotes and newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  test("renders null/undefined as empty and builds header + rows", () => {
    const out = toCsv(["a", "b"], [{ a: 1, b: null }, { a: "x", b: undefined }]);
    expect(out).toBe("a,b\r\n1,\r\nx,\r\n");
  });
});
