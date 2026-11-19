const { generateTemporaryPassword, ALPHABET } = require("../src/utils/password");

describe("generateTemporaryPassword", () => {
  test("is 12 characters from the unambiguous alphabet", () => {
    const pw = generateTemporaryPassword();
    expect(pw).toHaveLength(12);
    for (const ch of pw) expect(ALPHABET).toContain(ch);
  });
  test("never contains look-alike characters", () => {
    for (let i = 0; i < 200; i++) expect(generateTemporaryPassword()).not.toMatch(/[0O1lI]/);
  });
  test("is not repeated", () => {
    const set = new Set(Array.from({ length: 500 }, () => generateTemporaryPassword()));
    expect(set.size).toBe(500);
  });
  test("meets the 8-character minimum the change-password form requires", () => {
    expect(generateTemporaryPassword()).toMatch(/^.{8,}$/);
  });
});
