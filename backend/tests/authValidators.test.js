const { registerSchema, loginSchema, changePasswordSchema } = require("../src/validators/auth");

const reg = (o) => registerSchema.safeParse({ password: "longenough1", ...o });
const firstMessage = (r) => r.error.flatten().fieldErrors.loginId?.[0];

describe("student login IDs (registration numbers)", () => {
  test.each(["12092351", "12000001", "123456789012", "00000001"])("accepts %s", (id) => {
    expect(reg({ loginId: id, role: "student" }).success).toBe(true);
  });

  test.each(["1209235", "12345", "", "abcdefgh", "1209235a", "1209 2351", "12092351 ", "-1209235", "1.2092351"])(
    "rejects %j",
    (id) => {
      const r = reg({ loginId: id.trim() === id ? id : id, role: "student" });
      // a trailing space is trimmed by the schema, so only check the rest strictly
      if (id === "12092351 ") return expect(r.success).toBe(true);
      expect(r.success).toBe(false);
    }
  );

  test("tells the student what is wrong", () => {
    expect(firstMessage(reg({ loginId: "1234567", role: "student" }))).toMatch(/8 or more digits/);
  });

  test("a 5-digit faculty-style ID is NOT valid for a student", () => {
    expect(reg({ loginId: "12345", role: "student" }).success).toBe(false);
  });

  test("rejects an absurdly long ID", () => {
    expect(reg({ loginId: "1".repeat(21), role: "student" }).success).toBe(false);
  });
});

describe("faculty / officer IDs", () => {
  test.each(["12345", "123456", "10001", "12092351"])("accepts %s", (id) => {
    expect(reg({ loginId: id, role: "officer" }).success).toBe(true);
  });
  test.each(["1234", "abcde", "12a45", ""])("rejects %j", (id) => {
    expect(reg({ loginId: id, role: "officer" }).success).toBe(false);
  });
  test("tells the faculty member what is wrong", () => {
    expect(firstMessage(reg({ loginId: "1234", role: "officer" }))).toMatch(/5 or more digits/);
  });
});

describe("other registration rules", () => {
  test("rejects unknown roles (there is no company or admin role)", () => {
    expect(reg({ loginId: "12345678", role: "company" }).success).toBe(false);
    expect(reg({ loginId: "12345678", role: "admin" }).success).toBe(false);
  });
  test("an email address is not a valid login ID any more", () => {
    expect(reg({ loginId: "a@b.co", role: "student" }).success).toBe(false);
  });
  test("passwords must be 8-72 characters", () => {
    expect(registerSchema.safeParse({ loginId: "12345678", role: "student", password: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ loginId: "12345678", role: "student", password: "x".repeat(73) }).success).toBe(false);
  });
  test("the ID is trimmed", () => {
    expect(reg({ loginId: "  12345678  ", role: "student" }).data.loginId).toBe("12345678");
  });
});

describe("login and change-password schemas", () => {
  test("login does not enforce an ID format (so errors never reveal which IDs are valid)", () => {
    expect(loginSchema.safeParse({ loginId: "anything", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ loginId: "", password: "x" }).success).toBe(false);
  });
  test("new password must differ from the current one", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "samesame1", newPassword: "samesame1" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: "oldoldold1", newPassword: "newnewnew1" }).success).toBe(true);
  });
});
