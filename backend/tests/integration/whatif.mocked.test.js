/**
 * Real routes, validation, simulator and controller; only the database models are faked.
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123";

const mockState = { credentials: [] };
const S_NODE = "64b0000000000000000000d1";
const S_MONGO = "64b0000000000000000000d2";
const OPP1 = "64b0000000000000000000e1";
const OPP2 = "64b0000000000000000000e2";
const mockUsers = {};

const mockChain = (rows) => {
  const c = { populate: () => c, sort: () => c, limit: () => c, select: () => c, then: (res, rej) => Promise.resolve(rows).then(res, rej) };
  return c;
};

jest.mock("../../src/models/User", () => ({
  findById: jest.fn((id) => ({
    select: jest.fn().mockResolvedValue(mockUsers[String(id)] ? { _id: String(id), ...mockUsers[String(id)] } : null),
  })),
}));
jest.mock("../../src/models/StudentProfile", () => ({
  findOne: jest.fn(async () => ({
    _id: "profA", cgpa: 8, department: "CSE", batchYear: 2026, backlogs: 0, verification: { status: "unverified" },
  })),
}));
jest.mock("../../src/models/PlacementOpportunity", () => ({
  find: jest.fn(() => mockChain([
    { _id: "64b0000000000000000000e1", role: "Backend Intern", companyId: { name: "Acme" },
      requiredSkills: [{ skillId: "64b0000000000000000000d1", minLevel: 4, weight: 0.5 }, { skillId: "64b0000000000000000000d2", minLevel: 3, weight: 0.5 }] },
    { _id: "64b0000000000000000000e2", role: "DB Admin", companyId: { name: "Beta" },
      requiredSkills: [{ skillId: "64b0000000000000000000d2", minLevel: 3, weight: 1 }] },
  ])),
}));
jest.mock("../../src/models/EligibilityRule", () => ({
  // DB Admin needs CGPA 9: the student (8.0) is academically ineligible for it
  find: jest.fn(async () => [{ opportunityId: "64b0000000000000000000e2", minCgpa: 9, eligibleDepartments: [], eligibleBatchYears: [], maxBacklogs: 0 }]),
}));
jest.mock("../../src/models/Skill", () => ({
  find: jest.fn(async () => [{ _id: "64b0000000000000000000d1", name: "Node.js" }, { _id: "64b0000000000000000000d2", name: "MongoDB" }]),
}));
jest.mock("../../src/models/StudentSkill", () => ({
  find: jest.fn(async () => [{ skillId: "64b0000000000000000000d1", selfReportedLevel: 2, verifiedLevel: null }]),
}));
jest.mock("../../src/models/Credential", () => ({ find: jest.fn(() => mockChain(mockState.credentials)) }));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../../src/app");

const ID = { student: "64b0000000000000000000f1", officer: "64b0000000000000000000f2" };
Object.assign(mockUsers, {
  [ID.student]: { loginId: "12000001", role: "student", isActive: true, tokenVersion: 0, mustChangePassword: false },
  [ID.officer]: { loginId: "10001", role: "officer", isActive: true, tokenVersion: 0, mustChangePassword: false },
});
const as = (who) => ({ Authorization: `Bearer ${jwt.sign({ id: ID[who], tv: 0 }, process.env.JWT_SECRET)}` });
const post = (body, who = "student") => request(app).post("/api/students/me/what-if").set(as(who)).send(body);

beforeEach(() => { mockState.credentials = []; });

describe("GET /students/me/what-if/next-skills", () => {
  test("ranks the skill with the biggest lift first, using only roles the student can apply to", async () => {
    const res = await request(app).get("/api/students/me/what-if/next-skills").set(as("student"));
    expect(res.status).toBe(200);
    // Counted role: Backend Intern only (DB Admin needs CGPA 9). MongoDB 0->3 gives +50, Node.js 2->4 gives +25.
    expect(res.body.data.map((r) => r.skillName)).toEqual(["MongoDB", "Node.js"]);
    expect(res.body.data[0]).toMatchObject({ currentLevel: 0, targetLevel: 3, totalLift: 50, rolesImproved: 1 });
    expect(res.body.data[0].topRoles[0]).toMatchObject({ role: "Backend Intern", company: "Acme", before: 25, after: 75, gain: 50 });
    expect(res.body.considered).toBe(1);
    expect(res.body.excluded).toBe(1);
  });

  test("says when the advice rests on academic details that are not verified yet", async () => {
    const res = await request(app).get("/api/students/me/what-if/next-skills").set(as("student"));
    expect(res.body.provisional).toBe(true);
  });

  test("lists every role with today's score and whether the student is eligible", async () => {
    const res = await request(app).get("/api/students/me/what-if/next-skills").set(as("student"));
    const roles = Object.fromEntries(res.body.roles.map((r) => [r.role, r]));
    expect(roles["Backend Intern"]).toMatchObject({ eligible: true, score: 25 });
    expect(roles["DB Admin"]).toMatchObject({ eligible: false, score: 0 });
  });

  test("a faculty-verified certificate already counts, so that skill is no longer the top gap", async () => {
    mockState.credentials = [{ status: "verified", skillId: S_MONGO, awardedLevel: 5 }]; // capped to 3
    const res = await request(app).get("/api/students/me/what-if/next-skills").set(as("student"));
    expect(res.body.data.map((r) => r.skillName)).toEqual(["Node.js"]); // MongoDB now met via the certificate
    expect(res.body.roles.find((r) => r.role === "Backend Intern").score).toBe(75);
  });

  test("students only; no token is refused", async () => {
    expect((await request(app).get("/api/students/me/what-if/next-skills").set(as("officer"))).status).toBe(403);
    expect((await request(app).get("/api/students/me/what-if/next-skills")).status).toBe(401);
  });
});

describe("POST /students/me/what-if", () => {
  test("Node.js 2->4 lifts Backend Intern from 25% to 50%, and the rows say what changed", async () => {
    const res = await post({ opportunityId: OPP1, changes: [{ skillId: S_NODE, level: 4 }] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ baselineScore: 25, scenarioScore: 50, delta: 25, opportunity: { role: "Backend Intern", company: "Acme" } });
    expect(res.body.rows.find((r) => r.skillName === "Node.js")).toMatchObject({ before: 2, after: 4, raised: true });
  });

  test("shows the ripple effect on other roles, flagged when the student is not eligible", async () => {
    const res = await post({ opportunityId: OPP1, changes: [{ skillId: S_MONGO, level: 3 }] });
    expect(res.status).toBe(200);
    expect(res.body.delta).toBe(50);
    const ripple = Object.fromEntries(res.body.ripple.map((r) => [r.role, r]));
    expect(ripple["DB Admin"]).toMatchObject({ delta: 100, eligible: false });
    expect(ripple["Backend Intern"].delta).toBe(50);
  });

  test("no changes returns the baseline, so the page can draw its sliders", async () => {
    const res = await post({ opportunityId: OPP1, changes: [] });
    expect(res.status).toBe(200);
    expect(res.body.delta).toBe(0);
    expect(res.body.rows).toHaveLength(2);
    expect(res.body.ripple.map((r) => r.opportunityId)).toEqual([OPP1]); // nothing else moved
  });

  test("simulating changes nothing: asking twice gives the same answer", async () => {
    const body = { opportunityId: OPP1, changes: [{ skillId: S_NODE, level: 5 }] };
    expect((await post(body)).body).toEqual((await post(body)).body);
  });

  test.each([
    ["level 0", { opportunityId: OPP1, changes: [{ skillId: S_NODE, level: 0 }] }],
    ["level 6", { opportunityId: OPP1, changes: [{ skillId: S_NODE, level: 6 }] }],
    ["fractional level", { opportunityId: OPP1, changes: [{ skillId: S_NODE, level: 2.5 }] }],
    ["level as text", { opportunityId: OPP1, changes: [{ skillId: S_NODE, level: "3" }] }],
    ["bad skill id", { opportunityId: OPP1, changes: [{ skillId: "nope", level: 3 }] }],
    ["bad opportunity id", { opportunityId: "nope", changes: [] }],
    ["missing opportunity id", { changes: [] }],
    ["more than 10 changes", { opportunityId: OPP1, changes: Array.from({ length: 11 }, () => ({ skillId: S_NODE, level: 3 })) }],
  ])("rejects %s", async (_n, body) => {
    expect((await post(body)).status).toBe(422);
  });

  test("an opportunity that is not published (or does not exist) is a 404", async () => {
    expect((await post({ opportunityId: "64b0000000000000000000ee", changes: [] })).status).toBe(404);
  });

  test("students only", async () => {
    expect((await post({ opportunityId: OPP1, changes: [] }, "officer")).status).toBe(403);
    expect((await request(app).post("/api/students/me/what-if").send({})).status).toBe(401);
  });
});
