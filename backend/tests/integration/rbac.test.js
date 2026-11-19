process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123";

// Authentication now looks the user up (role, active flag, token version). We replace ONLY that
// lookup with an in-memory table, so everything else - JWT checks, role checks, validation,
// routing - runs for real without needing a database.
const mockUsers = {};
jest.mock("../../src/models/User", () => ({
  findById: jest.fn((id) => ({
    select: jest.fn().mockResolvedValue(mockUsers[String(id)] ? { _id: String(id), ...mockUsers[String(id)] } : null),
  })),
}));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../../src/app");

const ID = {
  student: "64b0000000000000000000a1",
  officer: "64b0000000000000000000a2",
  mustChange: "64b0000000000000000000a3",
  disabled: "64b0000000000000000000a4",
  bumped: "64b0000000000000000000a5",
};
const user = (role, extra = {}) => ({ loginId: "12000001", role, isActive: true, tokenVersion: 0, mustChangePassword: false, ...extra });
Object.assign(mockUsers, {
  [ID.student]: user("student"),
  [ID.officer]: user("officer", { loginId: "10001" }),
  [ID.mustChange]: user("student", { mustChangePassword: true }),
  [ID.disabled]: user("student", { isActive: false }),
  [ID.bumped]: user("student", { tokenVersion: 3 }), // password was changed since the token below was issued
});

const sign = (id, tv = 0, opts = {}) => jwt.sign({ id, tv }, process.env.JWT_SECRET, opts);
const bearer = (role) => ({ Authorization: `Bearer ${sign(ID[role])}` });

const OPP = "64b0000000000000000000bb";
const OFFICER_ONLY = [
  ["post", "/api/companies"],
  ["post", "/api/skills"],
  ["post", "/api/opportunities"],
  ["patch", `/api/opportunities/${OPP}/publish`],
  ["post", "/api/assessments"],
  ["post", `/api/assessments/${OPP}/questions`],
  ["get", `/api/assessments/${OPP}/questions`],
  ["get", "/api/analytics/overview"],
  ["get", "/api/analytics/batches/summary"],
  ["get", "/api/analytics/departments/skill-distribution"],
  ["get", `/api/analytics/opportunities/${OPP}/eligible-students`],
  ["get", `/api/analytics/opportunities/${OPP}/eligible-students/export`],
  ["get", "/api/analytics/skill-gaps/common"],
  ["post", "/api/verification/records/import"],
  ["get", "/api/verification/queue"],
  ["post", `/api/verification/${OPP}/approve`],
  ["post", `/api/verification/${OPP}/reject`],
  ["post", `/api/verification/${OPP}/reset-password`],
  ["get", `/api/verification/${OPP}/history`],
  ["get", "/api/credentials"],
  ["get", `/api/credentials/${OPP}/file`],
  ["post", `/api/credentials/${OPP}/approve`],
  ["post", `/api/credentials/${OPP}/reject`],
];

const STUDENT_ONLY = [
  ["get", "/api/students/me/profile"],
  ["put", "/api/students/me/profile"],
  ["get", "/api/students/me/skills"],
  ["get", `/api/opportunities/${OPP}/eligibility`],
  ["get", `/api/opportunities/${OPP}/readiness`],
  ["get", `/api/opportunities/${OPP}/readiness-history`],
  ["post", `/api/assessments/${OPP}/start`],
  ["post", `/api/assessments/attempts/${OPP}/submit`],
  ["post", "/api/students/me/verification/submit"],
  ["get", "/api/students/me/credentials"],
  ["post", "/api/students/me/credentials"],
  ["delete", `/api/students/me/credentials/${OPP}`],
  ["get", `/api/students/me/credentials/${OPP}/file`],
];

describe("RBAC: officer-only endpoints", () => {
  test.each(OFFICER_ONLY)("%s %s -> 401 without a token", async (method, path) => {
    expect((await request(app)[method](path)).status).toBe(401);
  });
  test.each(OFFICER_ONLY)("%s %s -> 403 for a student", async (method, path) => {
    expect((await request(app)[method](path).set(bearer("student"))).status).toBe(403);
  });
});

describe("RBAC: student-only endpoints", () => {
  test.each(STUDENT_ONLY)("%s %s -> 401 without a token", async (method, path) => {
    expect((await request(app)[method](path)).status).toBe(401);
  });
  test.each(STUDENT_ONLY)("%s %s -> 403 for an officer", async (method, path) => {
    expect((await request(app)[method](path).set(bearer("officer"))).status).toBe(403);
  });
});

describe("sessions and tokens", () => {
  const officerRoute = "/api/analytics/overview";

  test("rejects a token signed with the wrong secret", async () => {
    const bad = jwt.sign({ id: ID.officer, tv: 0 }, "some-other-secret-some-other-secret-1");
    expect((await request(app).get(officerRoute).set("Authorization", `Bearer ${bad}`)).status).toBe(401);
  });

  test("rejects an expired token", async () => {
    const expired = sign(ID.officer, 0, { expiresIn: -10 });
    expect((await request(app).get(officerRoute).set("Authorization", `Bearer ${expired}`)).status).toBe(401);
  });

  test("rejects an alg=none token", async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const none = `${b64({ alg: "none", typ: "JWT" })}.${b64({ id: ID.officer, tv: 0 })}.`;
    expect((await request(app).get(officerRoute).set("Authorization", `Bearer ${none}`)).status).toBe(401);
  });

  test("a role claim inside the token is never trusted (the database decides)", async () => {
    const forged = jwt.sign({ id: ID.student, tv: 0, role: "officer" }, process.env.JWT_SECRET);
    expect((await request(app).get(officerRoute).set("Authorization", `Bearer ${forged}`)).status).toBe(403);
  });

  test("a token for a user that no longer exists is rejected", async () => {
    const ghost = sign("64b0000000000000000000ff");
    expect((await request(app).get(officerRoute).set("Authorization", `Bearer ${ghost}`)).status).toBe(401);
  });

  test("a disabled account is locked out immediately, even with a valid token", async () => {
    const res = await request(app).get("/api/students/me/profile").set("Authorization", `Bearer ${sign(ID.disabled)}`);
    expect(res.status).toBe(401);
  });

  test("tokens issued before a password change/reset stop working", async () => {
    const stale = sign(ID.bumped, 2); // user is now at tokenVersion 3
    const res = await request(app).get("/api/students/me/profile").set("Authorization", `Bearer ${stale}`);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/no longer valid/);
  });

  test("a token with no version (issued by an older build) is rejected", async () => {
    const old = jwt.sign({ id: ID.student }, process.env.JWT_SECRET);
    expect((await request(app).get("/api/students/me/profile").set("Authorization", `Bearer ${old}`)).status).toBe(401);
  });

  test("while a forced password change is pending, everything except /me and change-password is blocked", async () => {
    const t = { Authorization: `Bearer ${sign(ID.mustChange)}` };
    for (const path of ["/api/students/me/profile", "/api/opportunities", "/api/skills"]) {
      const res = await request(app).get(path).set(t);
      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/Password change required/);
    }
    const me = await request(app).get("/api/auth/me").set(t);
    expect(me.status).toBe(200);
    expect(me.body.user.mustChangePassword).toBe(true);
  });

  test("change-password validates its input before touching the database", async () => {
    const t = { Authorization: `Bearer ${sign(ID.mustChange)}` };
    expect((await request(app).post("/api/auth/change-password").set(t).send({ currentPassword: "x", newPassword: "short" })).status).toBe(422);
    expect((await request(app).post("/api/auth/change-password").set(t).send({ currentPassword: "samesame1", newPassword: "samesame1" })).status).toBe(422);
    expect((await request(app).post("/api/auth/change-password").send({ currentPassword: "a", newPassword: "bbbbbbbb" })).status).toBe(401);
  });
});

describe("registration rules (rejected before touching the database)", () => {
  const post = (body) => request(app).post("/api/auth/register").send(body);

  test("student IDs must be 8+ digits", async () => {
    const res = await post({ loginId: "1209235", password: "longenough1", role: "student" });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toMatch(/8 or more digits/);
    expect((await post({ loginId: "abcdefgh", password: "longenough1", role: "student" })).status).toBe(422);
  });

  test("an email is no longer accepted as a login ID", async () => {
    expect((await post({ loginId: "a@b.co", password: "longenough1", role: "student" })).status).toBe(422);
  });

  test("faculty IDs must be 5+ digits", async () => {
    const res = await post({ loginId: "1234", password: "longenough1", role: "officer", inviteCode: "x" });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toMatch(/5 or more digits/);
  });

  test("there is no company or admin role", async () => {
    expect((await post({ loginId: "12345678", password: "longenough1", role: "company" })).status).toBe(422);
  });

  test("short passwords are rejected", async () => {
    expect((await post({ loginId: "12345678", password: "short", role: "student" })).status).toBe(422);
  });

  test("officer registration without an invite code is forbidden", async () => {
    delete process.env.OFFICER_INVITE_CODE;
    expect((await post({ loginId: "10002", password: "longenough1", role: "officer" })).status).toBe(403);
  });

  test("officer registration with a wrong invite code is forbidden", async () => {
    process.env.OFFICER_INVITE_CODE = "right-code";
    expect((await post({ loginId: "10002", password: "longenough1", role: "officer", inviteCode: "wrong-code" })).status).toBe(403);
  });

  test("login requires both fields", async () => {
    expect((await request(app).post("/api/auth/login").send({ loginId: "12000001" })).status).toBe(422);
  });
});

describe("input validation on officer routes", () => {
  test("import rejects an empty or malformed record list", async () => {
    const t = bearer("officer");
    expect((await request(app).post("/api/verification/records/import").set(t).send({ records: [] })).status).toBe(422);
    const bad = { registrationNumber: "12", department: "CSE", batchYear: 2026, cgpa: 11 };
    expect((await request(app).post("/api/verification/records/import").set(t).send({ records: [bad] })).status).toBe(422);
  });

  test("rejecting a student requires a reason", async () => {
    const res = await request(app).post(`/api/verification/${OPP}/reject`).set(bearer("officer")).send({});
    expect(res.status).toBe(422);
  });
});

describe("request body handling", () => {
  test("malformed JSON returns 400, not 500", async () => {
    const res = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Malformed/);
  });

  test("oversized bodies are rejected with 413 (except the bulk import route)", async () => {
    const big = { loginId: "12000001", password: "x".repeat(150 * 1024) };
    expect((await request(app).post("/api/auth/login").send(big)).status).toBe(413);
    const rows = Array.from({ length: 3000 }, (_, i) => ({ registrationNumber: `R${i}`, department: "CSE", batchYear: 2026, cgpa: 8, backlogs: 0 }));
    const res = await request(app).post("/api/verification/records/import").set(bearer("officer")).send({ records: rows });
    expect(res.status).not.toBe(413); // parsed fine; it fails validation (some IDs are too short) instead
  });

  test("unknown routes return the standard error shape", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(404);
  });
});
