const { createCredentialSchema, approveCredentialSchema } = require("../src/validators/credential");

const ok = { type: "mooc", title: "Machine Learning", issuer: "Coursera" };
const parse = (o) => createCredentialSchema.safeParse({ ...ok, ...o });

describe("createCredentialSchema", () => {
  test("accepts the minimum fields", () => expect(parse({}).success).toBe(true));
  test.each(["certification", "mooc"])("accepts type %s", (type) => expect(parse({ type }).success).toBe(true));
  test.each(["course", "badge", "", undefined])("rejects type %j", (type) => expect(parse({ type }).success).toBe(false));

  test("blank optional form fields are treated as not provided", () => {
    const r = parse({ issueDate: "", credentialId: "  ", link: "" });
    expect(r.success).toBe(true);
    expect(r.data.issueDate).toBeUndefined();
    expect(r.data.link).toBeUndefined();
  });

  test("title and issuer are required and trimmed", () => {
    expect(parse({ title: "a" }).success).toBe(false);
    expect(parse({ issuer: "" }).success).toBe(false);
    expect(parse({ title: "  Deep Learning  " }).data.title).toBe("Deep Learning");
    expect(parse({ title: "x".repeat(121) }).success).toBe(false);
  });

  test("dates must be real, recent-enough and not in the future", () => {
    expect(parse({ issueDate: "2025-06-30" }).success).toBe(true);
    for (const bad of ["30-06-2025", "2025-13-45", "1999-12-31", "not a date", "2025-02-30"]) {
      expect(parse({ issueDate: bad }).success).toBe(false);
    }
    const future = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    expect(parse({ issueDate: future }).success).toBe(false);
  });
});

describe("skill link on a certificate", () => {
  const SKILL = "64b0000000000000000000a1";
  test("skill and level must come together", () => {
    expect(parse({ skillId: SKILL, skillLevel: "3" }).success).toBe(true);
    expect(parse({ skillId: SKILL }).success).toBe(false);
    expect(parse({ skillLevel: "3" }).success).toBe(false);
    expect(parse({}).success).toBe(true); // both are optional
  });
  test("the level is a whole number from 1 to 5 (form values arrive as strings)", () => {
    expect(parse({ skillId: SKILL, skillLevel: "4" }).data.skillLevel).toBe(4);
    for (const bad of ["0", "6", "2.5", "abc", "-1"]) expect(parse({ skillId: SKILL, skillLevel: bad }).success).toBe(false);
  });
  test("blank form fields mean 'no skill chosen'", () => {
    const r = parse({ skillId: "", skillLevel: "" });
    expect(r.success).toBe(true);
    expect(r.data.skillId).toBeUndefined();
  });
  test("the skill id must look like an id", () => {
    expect(parse({ skillId: "not-an-id", skillLevel: 3 }).success).toBe(false);
  });
});

describe("approveCredentialSchema", () => {
  test("awarded level is optional, 1-5 and whole", () => {
    expect(approveCredentialSchema.safeParse({}).success).toBe(true);
    expect(approveCredentialSchema.safeParse({ awardedLevel: 3 }).success).toBe(true);
    for (const bad of [0, 6, 2.5, "3"]) expect(approveCredentialSchema.safeParse({ awardedLevel: bad }).success).toBe(false);
  });
});

describe("result (grade) on a certificate", () => {
  test("optional, trimmed, and at most 40 characters", () => {
    expect(parse({}).success).toBe(true);
    expect(parse({ result: "  O Grade " }).data.result).toBe("O Grade");
    expect(parse({ result: "x".repeat(40) }).success).toBe(true);
    expect(parse({ result: "x".repeat(41) }).success).toBe(false);
  });
  test("a blank form field means 'no result'", () => {
    expect(parse({ result: "" }).data.result).toBeUndefined();
    expect(parse({ result: "   " }).data.result).toBeUndefined();
  });
});
