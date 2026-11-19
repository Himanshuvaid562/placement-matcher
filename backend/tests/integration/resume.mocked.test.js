/**
 * Real routes, validation, services, PDF rendering and controllers; only the database models are faked.
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123";
delete process.env.PUBLIC_APP_URL;
process.env.CORS_ORIGIN = "http://localhost:3000";

const mockDb = { resumes: {}, shares: [], seq: 0 };
const mockState = { profile: null, credentials: [], skills: [] };
const mockUsers = {};
const mockCatalogue = [
  { _id: "64b0000000000000000000d1", name: "Node.js" },
  { _id: "64b0000000000000000000d2", name: "MongoDB" },
  { _id: "64b0000000000000000000d3", name: "Data Structures" },
  { _id: "64b0000000000000000000d4", name: "React" },
  { _id: "64b0000000000000000000d5", name: "Kubernetes" },
];
const mockChain = (rows) => {
  const c = { sort: () => c, limit: () => c, select: () => c, then: (res, rej) => Promise.resolve(rows).then(res, rej) };
  return c;
};

jest.mock("../../src/models/User", () => ({
  findById: jest.fn((id) => ({
    select: jest.fn().mockResolvedValue(mockUsers[String(id)] ? { _id: String(id), ...mockUsers[String(id)] } : null),
  })),
}));
jest.mock("../../src/models/StudentProfile", () => ({
  findOne: jest.fn(async (q) => (String(q.userId) === "64b0000000000000000000a1" ? mockState.profile : null)),
  findById: jest.fn(async (id) => (String(id) === "profA" ? mockState.profile : null)),
}));
jest.mock("../../src/models/Resume", () => ({
  findOne: jest.fn(async (q) => mockDb.resumes[String(q.studentId)] || null),
  findOneAndUpdate: jest.fn(async (filter, update) => {
    const key = String(filter.studentId);
    mockDb.resumes[key] = { ...(mockDb.resumes[key] || {}), ...update.$set };
    return mockDb.resumes[key];
  }),
}));
jest.mock("../../src/models/ResumeShare", () => ({
  create: jest.fn(async (doc) => {
    const s = { _id: `share${++mockDb.seq}`, createdAt: new Date(), viewCount: 0, ...doc, save: async function () { return this; } };
    mockDb.shares.push(s);
    return s;
  }),
  find: jest.fn((q) => mockChain(mockDb.shares.filter((s) => String(s.studentId) === String(q.studentId)))),
  findOne: jest.fn(async (q) =>
    mockDb.shares.find((s) =>
      (q._id === undefined || s._id === q._id) &&
      (q.studentId === undefined || String(s.studentId) === String(q.studentId)) &&
      (q.tokenHash === undefined || s.tokenHash === q.tokenHash)) || null),
  countDocuments: jest.fn(async (q) =>
    mockDb.shares.filter((s) => String(s.studentId) === String(q.studentId) && !s.revokedAt && s.expiresAt > new Date()).length),
  updateOne: jest.fn(async (q, u) => {
    const s = mockDb.shares.find((x) => x._id === q._id);
    if (s) { s.viewCount += u.$inc.viewCount; s.lastViewedAt = u.$set.lastViewedAt; }
  }),
}));
jest.mock("../../src/models/Credential", () => ({
  find: jest.fn((q) => mockChain(mockState.credentials.filter((c) => q.status === undefined || c.status === q.status))),
  countDocuments: jest.fn(async (q) => mockState.credentials.filter((c) => c.status === q.status).length),
}));
jest.mock("../../src/models/StudentSkill", () => ({ find: jest.fn(async () => mockState.skills) }));
jest.mock("../../src/models/Skill", () => ({
  find: jest.fn(async (q) => mockCatalogue.filter((s) => q._id.$in.includes(s._id))),
}));
jest.mock("../../src/models/PlacementOpportunity", () => ({
  findOne: jest.fn(async (q) =>
    q._id === "64b0000000000000000000b1" && q.status === "published"
      ? {
          _id: q._id,
          requiredSkills: [
            { skillId: "64b0000000000000000000d1", minLevel: 4, weight: 0.5 },
            { skillId: "64b0000000000000000000d2", minLevel: 3, weight: 0.25 },
            { skillId: "64b0000000000000000000d5", minLevel: 2, weight: 0.25 },
          ],
        }
      : null),
}));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../../src/app");

const ID = { alice: "64b0000000000000000000a1", officer: "64b0000000000000000000a9" };
const OPP = "64b0000000000000000000b1";
Object.assign(mockUsers, {
  [ID.alice]: { loginId: "12000001", role: "student", isActive: true, tokenVersion: 0, mustChangePassword: false },
  [ID.officer]: { loginId: "10001", role: "officer", isActive: true, tokenVersion: 0, mustChangePassword: false },
});
const as = (who) => ({ Authorization: `Bearer ${jwt.sign({ id: ID[who], tv: 0 }, process.env.JWT_SECRET)}` });
const binary = (res, cb) => { const chunks = []; res.on("data", (c) => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks))); };

const RESUME = {
  fullName: "Ananya Sharma",
  contact: { email: "anu@example.com", phone: "+91 98765 43210", github: "https://GitHub.com/anu" },
  skillGroups: [
    { label: "Languages", items: ["Data Structures", "JavaScript"] },
    { label: "Web Technologies", items: ["Node.js", "React.js"] },
  ],
  projects: [{ title: "Placement Matcher", date: "2026-09", bullets: ["Built with Express and MongoDB."], techStack: ["Node.js"] }],
  training: [{ title: "Cloud Fundamentals", date: "2026-07", description: "Covered CI/CD pipelines." }],
  education: { degree: "Bachelor of Technology", start: "2024-08", end: "present" },
  otherEducation: [{ institution: "Demo Public School", level: "Intermediate", start: "2023-03", end: "2024-05", detail: "PCM; Percentage: 78%" }],
};
const save = (body = RESUME) => request(app).put("/api/students/me/resume").set(as("alice")).send(body);
const share = (body = {}) => request(app).post("/api/students/me/resume/shares").set(as("alice")).send(body);
const verify = (token) => request(app).get(`/api/public/verify/${token}`); // NO Authorization header

beforeEach(() => {
  mockDb.resumes = {}; mockDb.shares = []; mockDb.seq = 0;
  mockState.profile = {
    _id: "profA", userId: ID.alice, registrationNumber: "12000001",
    // what the student typed (inflated) vs what the university verified
    department: "ECE", batchYear: 2041, cgpa: 9.9, backlogs: 0,
    verification: { status: "verified", reviewedAt: new Date("2026-10-01"), verifiedSnapshot: { department: "CSE", batchYear: 2026, cgpa: 8.2, backlogs: 0 } },
  };
  mockState.credentials = [
    { status: "verified", title: "Server-side NodeJS", issuer: "Coursera", type: "mooc", skillId: "64b0000000000000000000d1", awardedLevel: 4, issueDate: new Date("2025-06-15"), reviewedAt: new Date("2026-09-01") },
    { status: "pending", title: "Waiting for faculty", issuer: "X", type: "certification" },
  ];
  mockState.skills = [
    { skillId: "64b0000000000000000000d3", verifiedLevel: 4, selfReportedLevel: null },
    { skillId: "64b0000000000000000000d4", selfReportedLevel: 3, verifiedLevel: null },
  ];
});

describe("saving and reading the resume", () => {
  test("before anything is saved: empty editor, but the verified data is already previewed", async () => {
    const res = await request(app).get("/api/students/me/resume").set(as("alice"));
    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(false);
    expect(res.body.resume).toMatchObject({ fullName: "", skillGroups: [], projects: [], training: [], otherEducation: [] });
    expect(res.body.preview.education).toMatchObject({ verified: true, department: "Computer Science and Engineering", cgpa: 8.2 });
    expect(res.body.pendingCertificates).toBe(1);
  });

  test("saves, and the preview is assembled from VERIFIED data (typed-in numbers are ignored)", async () => {
    const res = await save({ ...RESUME, cgpa: 10, education: { ...RESUME.education, cgpa: 10, department: "AI" } });
    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(true);
    expect(res.body.preview.name).toBe("Ananya Sharma");
    expect(res.body.preview.education).toMatchObject({
      institution: "Lovely Professional University", location: "Phagwara, Punjab", degree: "Bachelor of Technology",
      department: "Computer Science and Engineering", departmentCode: "CSE", batchYear: 2026, cgpa: 8.2,
    });
    // only the degree and dates were stored; the typed CGPA and department never reached the database
    const stored = Object.values(mockDb.resumes)[0];
    expect(stored.education).toEqual({ degree: "Bachelor of Technology", start: "2024-08", end: "present" });
    expect(JSON.stringify(stored)).not.toMatch(/"cgpa"|"department"|"AI"/);
    expect(res.body.preview.skills.map((s) => [s.name, s.evidence])).toEqual([
      ["Data Structures", "assessment"], ["Node.js", "certificate"], ["React", "self"],
    ]);
    expect(res.body.preview.certificates.map((c) => c.title)).toEqual(["Server-side NodeJS"]); // the pending one is not on it
  });

  test("typed skills carry evidence markers in the preview: assessment, certificate, or none", async () => {
    const res = await save();
    const items = Object.fromEntries(res.body.preview.skillGroups.flatMap((g) => g.items).map((i) => [i.name, i.evidence]));
    expect(items).toEqual({ "Data Structures": "assessment", JavaScript: null, "Node.js": "certificate", "React.js": null });
  });

  test("what was typed comes back to the editor exactly (round trip)", async () => {
    await save().expect(200);
    const res = await request(app).get("/api/students/me/resume").set(as("alice"));
    expect(res.body.saved).toBe(true);
    expect(res.body.resume).toMatchObject({
      fullName: "Ananya Sharma",
      skillGroups: RESUME.skillGroups,
      projects: [{ title: "Placement Matcher", date: "2026-09", bullets: ["Built with Express and MongoDB."], techStack: ["Node.js"] }],
      training: [{ title: "Cloud Fundamentals", date: "2026-07", description: "Covered CI/CD pipelines." }],
      education: RESUME.education,
      otherEducation: [{ institution: "Demo Public School", level: "Intermediate", detail: "PCM; Percentage: 78%" }],
    });
  });

  test("an older client that still sends summary / experience / achievements is not rejected; those fields are simply dropped", async () => {
    const res = await save({ ...RESUME, summary: "old", experience: [{ organization: "A", role: "B", start: "2025-01", end: "present" }], achievements: ["x"], contact: { ...RESUME.contact, city: "Jalandhar" } });
    expect(res.status).toBe(200);
    const stored = JSON.stringify(Object.values(mockDb.resumes)[0]);
    expect(stored).not.toMatch(/"summary"|"experience"|"achievements"|Jalandhar/);
  });

  test("links are screened and normalised", async () => {
    const res = await save();
    expect(res.body.resume.contact.github).toBe("https://github.com/anu");
  });

  test.each([
    ["http link", { contact: { github: "http://github.com/x" } }, /Github/],
    ["javascript: link", { contact: { linkedin: "javascript:alert(1)" } }, /Linkedin/],
    ["IP-address link", { contact: { portfolio: "https://10.0.0.1/me" } }, /Portfolio/],
    ["bad project link", { projects: [{ title: "P", link: "https://localhost/x" }] }, /Project 1 link/],
    ["bad training link", { training: [{ title: "T", link: "javascript:alert(1)" }] }, /Training 1 link/],
  ])("refuses a %s, naming the field", async (_n, extra, pattern) => {
    const res = await save({ ...RESUME, ...extra });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(pattern);
  });

  test.each([
    ["no name", { fullName: "" }],
    ["bad phone", { contact: { phone: "call me" } }],
    ["too many projects", { projects: Array.from({ length: 6 }, () => ({ title: "P" })) }],
    ["bad project date", { projects: [{ title: "P", date: "June 2025" }] }],
    ["five bullets on one project", { projects: [{ title: "P", bullets: ["a", "b", "c", "d", "e"] }] }],
    ["bad education end date", { education: { start: "2024-08", end: "someday" } }],
    ["a skill group with no name", { skillGroups: [{ label: "", items: ["C"] }] }],
    ["too many skill groups", { skillGroups: Array.from({ length: 7 }, () => ({ label: "G", items: ["C"] })) }],
  ])("refuses %s", async (_n, extra) => {
    expect((await save({ ...RESUME, ...extra })).status).toBe(422);
  });

  test("an unverified profile is previewed with its flag, not as verified", async () => {
    mockState.profile.verification = { status: "pending" };
    const res = await request(app).get("/api/students/me/resume").set(as("alice"));
    expect(res.body.preview.education).toMatchObject({ verified: false, cgpa: 9.9 });
  });
});

describe("resume check against a role", () => {
  test("needs a saved resume first", async () => {
    expect((await request(app).get(`/api/students/me/resume/check/${OPP}`).set(as("alice"))).status).toBe(409);
  });

  test("reports listed / mentioned / absent with a weighted coverage", async () => {
    await save().expect(200);
    const res = await request(app).get(`/api/students/me/resume/check/${OPP}`).set(as("alice"));
    expect(res.status).toBe(200);
    expect(Object.fromEntries(res.body.rows.map((r) => [r.name, r.status]))).toEqual({ "Node.js": "listed", MongoDB: "mentioned", Kubernetes: "absent" });
    expect(res.body.coveragePct).toBe(75);
    expect(res.body.disclaimer).toMatch(/keyword check/);
  });

  test("unknown or unpublished roles and malformed ids are 404", async () => {
    await save().expect(200);
    expect((await request(app).get("/api/students/me/resume/check/64b0000000000000000000ee").set(as("alice"))).status).toBe(404);
    expect((await request(app).get("/api/students/me/resume/check/nope").set(as("alice"))).status).toBe(404);
  });
});

describe("verification links (shares)", () => {
  test("needs a saved resume", async () => {
    expect((await share()).status).toBe(409);
  });

  test("the token is returned once and only its hash is stored", async () => {
    await save().expect(200);
    const res = await share();
    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.body.url).toBe(`http://localhost:3000/verify/${res.body.token}`);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(JSON.stringify(mockDb.shares)).not.toContain(res.body.token); // not stored
    expect(mockDb.shares[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.share).toMatchObject({ active: true, showCgpa: true, showRegistrationNumber: false, viewCount: 0 });
  });

  test("expiry is 7, 30 or 90 days; anything else is refused", async () => {
    await save().expect(200);
    const res = await share({ expiresInDays: 7 });
    const days = (new Date(res.body.share.expiresAt) - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect((await share({ expiresInDays: 15 })).status).toBe(422);
  });

  test("listing never shows tokens or hashes", async () => {
    await save().expect(200);
    const created = await share();
    const list = await request(app).get("/api/students/me/resume/shares").set(as("alice"));
    expect(list.body.data).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toMatch(new RegExp(`${created.body.token}|tokenHash|[a-f0-9]{64}`));
  });

  test("at most 10 active links at a time", async () => {
    await save().expect(200);
    for (let i = 0; i < 10; i++) await share().expect(201);
    const res = await share();
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/at most 10/);
  });

  test("revoking works, is repeatable, and cannot touch someone else's link", async () => {
    await save().expect(200);
    const created = await share();
    const id = created.body.share.id;
    const r1 = await request(app).delete(`/api/students/me/resume/shares/${id}`).set(as("alice"));
    expect(r1.status).toBe(200);
    expect(r1.body.share.active).toBe(false);
    expect((await request(app).delete(`/api/students/me/resume/shares/${id}`).set(as("alice"))).status).toBe(200);
    expect((await request(app).delete("/api/students/me/resume/shares/nope").set(as("alice"))).status).toBe(404);
  });
});

describe("the public verification page (no login)", () => {
  let token;
  beforeEach(async () => {
    await save().expect(200);
    token = (await share()).body.token;
  });

  test("a recruiter sees only verified facts, with no login", async () => {
    const res = await verify(token);
    expect(res.status).toBe(200);
    expect(res.body.student).toEqual({ name: "Ananya Sharma", nameIsSelfEntered: true });
    expect(res.body.academic).toMatchObject({ status: "verified", department: "CSE", batchYear: 2026, backlogs: 0, cgpa: 8.2 });
    expect(res.body.academic).not.toHaveProperty("registrationNumber"); // hidden by default
    expect(res.body.skills.map((s) => s.name)).toEqual(["Data Structures", "Node.js"]); // React is self-reported
    expect(res.body.certificates.map((c) => c.title)).toEqual(["Server-side NodeJS"]);
  });

  test("it never leaks contact details, projects, training, schools, typed skills, typed-in numbers, or pending certificates", async () => {
    const json = JSON.stringify((await verify(token)).body);
    expect(json).not.toMatch(/anu@example|98765|github|Placement Matcher|Cloud Fundamentals|Demo Public School|Web Technologies|JavaScript|9\.9|ECE|2041|Waiting for faculty|12000001/);
  });

  test("the student's choices are honoured", async () => {
    const t2 = (await share({ showCgpa: false, showRegistrationNumber: true })).body.token;
    const body = (await verify(t2)).body;
    expect(body.academic).not.toHaveProperty("cgpa");
    expect(body.academic.registrationNumber).toBe("12000001");
  });

  test("it is never cached or indexed, and views are counted", async () => {
    const res = await verify(token);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(res.headers["x-robots-tag"]).toMatch(/noindex/);
    await verify(token);
    const list = await request(app).get("/api/students/me/resume/shares").set(as("alice"));
    expect(list.body.data[0].viewCount).toBe(2);
    expect(list.body.data[0].lastViewedAt).toBeTruthy();
  });

  test("if the university withdraws verification, the page stops vouching for the numbers", async () => {
    mockState.profile.verification = { status: "rejected" };
    const body = (await verify(token)).body;
    expect(body.academic.status).toBe("unverified");
    expect(JSON.stringify(body.academic)).not.toMatch(/8\.2|CSE|2026/);
  });

  test("bad, revoked and expired links all give the SAME answer, so links cannot be probed", async () => {
    const unknown = await verify("A".repeat(43));
    const malformed = await verify("short");
    await request(app).delete(`/api/students/me/resume/shares/${mockDb.shares[0]._id}`).set(as("alice")).expect(200);
    const revoked = await verify(token);

    const t2 = (await share()).body.token;
    mockDb.shares[1].expiresAt = new Date(Date.now() - 1000);
    const expired = await verify(t2);

    for (const r of [unknown, malformed, revoked, expired]) expect(r.status).toBe(404);
    expect(malformed.body).toEqual(unknown.body);
    expect(revoked.body).toEqual(unknown.body);
    expect(expired.body).toEqual(unknown.body);
    expect(revoked.body.error.message).toMatch(/not valid/);
  });
});

describe("downloading the PDF", () => {
  test("needs a saved resume", async () => {
    expect((await request(app).post("/api/students/me/resume/pdf").set(as("alice")).send({})).status).toBe(409);
  });

  test("a plain PDF: attachment, real PDF bytes, safe file name", async () => {
    await save().expect(200);
    const res = await request(app).post("/api/students/me/resume/pdf").set(as("alice")).send({}).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="Ananya_Sharma_resume.pdf"');
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(res.body.subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("the PDF is a single page in the recommended format, with clickable links", async () => {
    await save().expect(200);
    const res = await request(app).post("/api/students/me/resume/pdf").set(as("alice")).send({}).buffer(true).parse(binary);
    const raw = res.body.toString("latin1");
    expect((raw.match(/\/Type \/Page(?!s)/g) || []).length).toBe(1);
    expect((raw.match(/\/Subtype \/Link/g) || []).length).toBe(2); // this resume has a GitHub link and an email (mailto:) link
  });

  test("the plain format (no verification marks) is accepted; a non-boolean is refused", async () => {
    await save().expect(200);
    const plain = await request(app).post("/api/students/me/resume/pdf").set(as("alice")).send({ verificationMarks: false }).buffer(true).parse(binary);
    expect(plain.status).toBe(200);
    expect(plain.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect((await request(app).post("/api/students/me/resume/pdf").set(as("alice")).send({ verificationMarks: "no" })).status).toBe(422);
  });

  test("with a live verification link the PDF also carries the QR code (it is larger)", async () => {
    await save().expect(200);
    const { token } = (await share()).body;
    const plain = await request(app).post("/api/students/me/resume/pdf").set(as("alice")).send({}).buffer(true).parse(binary);
    const linked = await request(app).post("/api/students/me/resume/pdf").set(as("alice")).send({ shareToken: token }).buffer(true).parse(binary);
    expect(linked.status).toBe(200);
    expect(linked.body.length).toBeGreaterThan(plain.body.length);
  });

  test.each([
    ["a made-up token", () => "B".repeat(43)],
    ["a malformed token", () => "short"],
  ])("refuses %s", async (_n, make) => {
    await save().expect(200);
    const res = await request(app).post("/api/students/me/resume/pdf").set(as("alice")).send({ shareToken: make() });
    expect(res.status).toBe(422);
  });

  test("refuses a revoked link", async () => {
    await save().expect(200);
    const created = await share();
    await request(app).delete(`/api/students/me/resume/shares/${created.body.share.id}`).set(as("alice")).expect(200);
    const res = await request(app).post("/api/students/me/resume/pdf").set(as("alice")).send({ shareToken: created.body.token });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/no longer active/);
  });
});

describe("who may use these routes", () => {
  test.each([
    ["get", "/api/students/me/resume"], ["put", "/api/students/me/resume"],
    ["get", `/api/students/me/resume/check/${OPP}`], ["get", "/api/students/me/resume/shares"],
    ["post", "/api/students/me/resume/shares"], ["post", "/api/students/me/resume/pdf"],
  ])("officers get 403 and anonymous callers 401 on %s %s", async (method, path) => {
    expect((await request(app)[method](path).set(as("officer"))).status).toBe(403);
    expect((await request(app)[method](path)).status).toBe(401);
  });
});
