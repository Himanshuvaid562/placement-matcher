const { shouldRecord, MIN_INTERVAL_MS } = require("../src/services/readinessHistoryService");

describe("shouldRecord", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const recent = new Date(now.getTime() - 60 * 1000);
  const old = new Date(now.getTime() - MIN_INTERVAL_MS - 1000);

  test("records the first snapshot", () => {
    expect(shouldRecord(null, { matchScore: 50, eligible: true }, now)).toBe(true);
  });

  test("skips an identical, recent snapshot", () => {
    const last = { matchScore: 50, eligible: true, createdAt: recent };
    expect(shouldRecord(last, { matchScore: 50, eligible: true }, now)).toBe(false);
  });

  test("records when the score changes", () => {
    const last = { matchScore: 50, eligible: true, createdAt: recent };
    expect(shouldRecord(last, { matchScore: 62.5, eligible: true }, now)).toBe(true);
  });

  test("records when eligibility flips", () => {
    const last = { matchScore: 50, eligible: true, createdAt: recent };
    expect(shouldRecord(last, { matchScore: 50, eligible: false }, now)).toBe(true);
  });

  test("records an unchanged snapshot once it is stale", () => {
    const last = { matchScore: 50, eligible: true, createdAt: old };
    expect(shouldRecord(last, { matchScore: 50, eligible: true }, now)).toBe(true);
  });
});
