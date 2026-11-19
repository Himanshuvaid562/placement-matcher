const { resumeSchema, shareSchema, pdfSchema } = require("../src/validators/resume");

const ok = { fullName: "Ananya Sharma" };
const parse = (o) => resumeSchema.safeParse({ ...ok, ...o });
const proj = (o = {}) => ({ title: "Placement Matcher", ...o });

describe("resumeSchema: basics", () => {
  test("a name alone is enough; everything else defaults to empty", () => {
    const r = parse({});
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ contact: {}, skillGroups: [], projects: [], training: [], education: {}, otherEducation: [] });
  });
  test("the name is required, trimmed, and 2-80 characters", () => {
    expect(resumeSchema.safeParse({}).success).toBe(false);
    expect(parse({ fullName: "A" }).success).toBe(false);
    expect(parse({ fullName: "x".repeat(81) }).success).toBe(false);
    expect(parse({ fullName: "  Ananya  " }).data.fullName).toBe("Ananya");
  });
  test("sections the recommended format does not have are dropped, not stored", () => {
    const r = parse({ summary: "hi", experience: [{ organization: "A", role: "B", start: "2025-01", end: "present" }], achievements: ["x"], contact: { city: "Jalandhar" } });
    expect(r.success).toBe(true);
    for (const k of ["summary", "experience", "achievements"]) expect(r.data).not.toHaveProperty(k);
    expect(r.data.contact).not.toHaveProperty("city");
  });
});

describe("resumeSchema: verified facts cannot be typed in", () => {
  test("top-level academic fields are dropped", () => {
    const r = parse({ cgpa: 10, registrationNumber: "99999999", verified: true, department: "CSE", skills: [{ name: "x", level: 5 }] });
    expect(r.success).toBe(true);
    for (const k of ["cgpa", "registrationNumber", "verified", "department", "skills"]) expect(r.data).not.toHaveProperty(k);
  });
  test("inside education only degree and dates survive; CGPA, department, verification are dropped", () => {
    const r = parse({ education: { degree: "B.Tech", start: "2024-08", end: "present", cgpa: 10, department: "ECE", verified: true, institution: "MIT" } });
    expect(r.success).toBe(true);
    expect(r.data.education).toEqual({ degree: "B.Tech", start: "2024-08", end: "present" });
  });
  test("certificates are not part of what a student submits", () => {
    expect(parse({ certificates: [{ title: "Fake", issuer: "Me" }] }).data).not.toHaveProperty("certificates");
  });
});

describe("resumeSchema: contact", () => {
  test("blanks are 'not provided'; a bad email or phone is refused", () => {
    expect(parse({ contact: { email: "", phone: " ", linkedin: "" } }).data.contact.email).toBeUndefined();
    expect(parse({ contact: { email: "not-an-email" } }).success).toBe(false);
    expect(parse({ contact: { phone: "abc" } }).success).toBe(false);
    expect(parse({ contact: { phone: "+91 98765-43210" } }).success).toBe(true);
  });
  test("links are length-bounded here (the safety check on them happens in the controller)", () => {
    expect(parse({ contact: { github: "https://github.com/x" } }).success).toBe(true);
    expect(parse({ contact: { github: "x".repeat(301) } }).success).toBe(false);
  });
});

describe("resumeSchema: skill groups (Languages, Web Technologies, ...)", () => {
  const group = (o = {}) => ({ label: "Languages", items: ["C++", "Python"], ...o });
  test("a group needs a label; items are bounded", () => {
    expect(parse({ skillGroups: [group()] }).success).toBe(true);
    expect(parse({ skillGroups: [group({ label: "" })] }).success).toBe(false);
    expect(parse({ skillGroups: [group({ label: "x".repeat(31) })] }).success).toBe(false);
    expect(parse({ skillGroups: [group({ items: ["x".repeat(31)] })] }).success).toBe(false);
    expect(parse({ skillGroups: [group({ items: [""] })] }).success).toBe(false);
  });
  test("at most 6 groups and 15 items per group", () => {
    expect(parse({ skillGroups: Array.from({ length: 7 }, () => group()) }).success).toBe(false);
    expect(parse({ skillGroups: [group({ items: Array.from({ length: 16 }, (_, i) => `s${i}`) })] }).success).toBe(false);
    expect(parse({ skillGroups: [group({ items: Array.from({ length: 15 }, (_, i) => `s${i}`) })] }).success).toBe(true);
  });
  test("items are trimmed", () => {
    expect(parse({ skillGroups: [group({ items: ["  Docker  "] })] }).data.skillGroups[0].items).toEqual(["Docker"]);
  });
});

describe("resumeSchema: projects (title, Link, date, bullets, Technologies)", () => {
  test("a title is required, and at most 5 projects", () => {
    expect(parse({ projects: [proj()] }).success).toBe(true);
    expect(parse({ projects: [proj({ title: "" })] }).success).toBe(false);
    expect(parse({ projects: Array.from({ length: 6 }, () => proj()) }).success).toBe(false);
  });
  test("at most 4 bullets of at most 220 characters", () => {
    expect(parse({ projects: [proj({ bullets: ["a", "b", "c", "d"] })] }).success).toBe(true);
    expect(parse({ projects: [proj({ bullets: ["a", "b", "c", "d", "e"] })] }).success).toBe(false);
    expect(parse({ projects: [proj({ bullets: ["x".repeat(221)] })] }).success).toBe(false);
    expect(parse({ projects: [proj({ bullets: [""] })] }).success).toBe(false);
  });
  test("the technologies list is bounded", () => {
    expect(parse({ projects: [proj({ techStack: Array.from({ length: 12 }, (_, i) => `t${i}`) })] }).success).toBe(true);
    expect(parse({ projects: [proj({ techStack: Array.from({ length: 13 }, (_, i) => `t${i}`) })] }).success).toBe(false);
  });
  test.each([["2025-09", true], ["2025-12", true], ["2025-13", false], ["2025-00", false], ["Sep 2025", false], ["2025-9", false], ["25-09", false]])(
    "date %j -> %s", (date, expected) => expect(parse({ projects: [proj({ date })] }).success).toBe(expected));
  test("a blank date is simply not provided", () => {
    expect(parse({ projects: [proj({ date: "" })] }).data.projects[0].date).toBeUndefined();
  });
  test("the old single 'description' is no longer accepted from the editor", () => {
    expect(parse({ projects: [proj({ description: "old" })] }).data.projects[0]).not.toHaveProperty("description");
  });
});

describe("resumeSchema: training, education and other education", () => {
  test("training: title required, at most 3, description bounded", () => {
    expect(parse({ training: [{ title: "DevOps", date: "2026-07", description: "x" }] }).success).toBe(true);
    expect(parse({ training: [{ title: "" }] }).success).toBe(false);
    expect(parse({ training: Array.from({ length: 4 }, () => ({ title: "T" })) }).success).toBe(false);
    expect(parse({ training: [{ title: "T", description: "x".repeat(401) }] }).success).toBe(false);
  });
  test("education dates are YYYY-MM and 'present' is allowed for the end only", () => {
    expect(parse({ education: { start: "2024-08", end: "present" } }).success).toBe(true);
    expect(parse({ education: { start: "2024-08", end: "Present" } }).success).toBe(true);
    expect(parse({ education: { start: "present" } }).success).toBe(false);
    expect(parse({ education: { start: "Aug 2024" } }).success).toBe(false);
    expect(parse({ education: { end: "2026-13" } }).success).toBe(false);
  });
  test("other education: institution required, at most 3, detail bounded", () => {
    const o = (x = {}) => ({ institution: "Demo School", level: "Intermediate", start: "2023-03", end: "2024-05", detail: "PCM; 78%", ...x });
    expect(parse({ otherEducation: [o()] }).success).toBe(true);
    expect(parse({ otherEducation: [o({ institution: "" })] }).success).toBe(false);
    expect(parse({ otherEducation: Array.from({ length: 4 }, () => o()) }).success).toBe(false);
    expect(parse({ otherEducation: [o({ detail: "x".repeat(121) })] }).success).toBe(false);
  });
});

describe("shareSchema", () => {
  test("defaults: 30 days, CGPA shown, registration number hidden", () => {
    expect(shareSchema.parse({})).toEqual({ expiresInDays: 30, showCgpa: true, showRegistrationNumber: false });
  });
  test.each([7, 30, 90])("accepts %i days", (d) => expect(shareSchema.safeParse({ expiresInDays: d }).success).toBe(true));
  test.each([0, 1, 15, 365, "30", null])("rejects %j days", (d) => expect(shareSchema.safeParse({ expiresInDays: d }).success).toBe(false));
});

describe("pdfSchema", () => {
  test("the share token is optional but must look like one", () => {
    expect(pdfSchema.safeParse({}).success).toBe(true);
    expect(pdfSchema.safeParse({ shareToken: "a".repeat(43) }).success).toBe(true);
    expect(pdfSchema.safeParse({ shareToken: "short" }).success).toBe(false);
  });
  test("verification marks default to OFF (the exact recommended format) and must be a real boolean", () => {
    expect(pdfSchema.parse({}).verificationMarks).toBe(false);
    expect(pdfSchema.parse({ verificationMarks: true }).verificationMarks).toBe(true);
    expect(pdfSchema.safeParse({ verificationMarks: "no" }).success).toBe(false);
  });
});
