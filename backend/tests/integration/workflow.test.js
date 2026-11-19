/**
 * End-to-end workflow against a real MongoDB.
 *   - Default: starts an in-memory MongoDB (mongodb-memory-server downloads a binary on first run).
 *   - Or set MONGO_TEST_URI to point at any throwaway MongoDB (the database is DROPPED afterwards!).
 *   - Set REQUIRE_DB_TESTS=1 (as CI does) to make a missing database a hard failure instead of a skip.
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123";
process.env.OFFICER_INVITE_CODE = "invite-123";

const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/app");

let mongod;
let dbReady = false;

beforeAll(async () => {
  try {
    let uri = process.env.MONGO_TEST_URI;
    if (!uri) {
      const { MongoMemoryServer } = require("mongodb-memory-server");
      mongod = await MongoMemoryServer.create();
      uri = mongod.getUri();
    }
    await mongoose.connect(uri);
    await mongoose.connection.dropDatabase();
    // dropDatabase also removed the indexes; rebuild them (the verified-registration-number rule is an index)
    await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
    dbReady = true;
  } catch (err) {
    if (process.env.REQUIRE_DB_TESTS) throw err;
    console.warn(`\n[workflow.test] SKIPPED - no MongoDB available: ${err.message.split("\n")[0]}\n`);
  }
}, 180000);

afterAll(async () => {
  if (dbReady) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongoose.disconnect().catch(() => {});
    await mongod.stop();
  }
});

// Tests share state and run in order; each one is skipped (not failed) when there is no database.
const step = (name, fn) =>
  test(name, async () => {
    if (!dbReady) return;
    await fn();
  });

const PASSWORD = "Passw0rd!long";
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const ctx = {};

async function signUp(loginId, role, extra = {}) {
  const reg = await request(app).post("/api/auth/register").send({ loginId, password: PASSWORD, role, ...extra });
  expect(reg.status).toBe(201);
  const login = await request(app).post("/api/auth/login").send({ loginId, password: PASSWORD });
  expect(login.status).toBe(200);
  return login.body.token;
}

describe("accounts", () => {
  step("registers a faculty member (5+ digit ID + invite code) and students (8+ digit registration numbers)", async () => {
    ctx.officer = await signUp("50001", "officer", { inviteCode: "invite-123" });
    ctx.s1 = await signUp("12000001", "student");
    ctx.s2 = await signUp("12000002", "student");
  });

  step("rejects badly formatted IDs", async () => {
    const post = (body) => request(app).post("/api/auth/register").send({ password: PASSWORD, ...body });
    expect((await post({ loginId: "1200000", role: "student" })).status).toBe(422); // 7 digits
    expect((await post({ loginId: "student@lpu.edu", role: "student" })).status).toBe(422); // an email
    expect((await post({ loginId: "1234", role: "officer", inviteCode: "invite-123" })).status).toBe(422); // < 5 digits
    expect((await post({ loginId: "50002", role: "officer" })).status).toBe(403); // no invite code
  });

  step("rejects duplicate IDs; wrong password and unknown ID give the same message", async () => {
    const dup = await request(app).post("/api/auth/register").send({ loginId: "12000001", password: PASSWORD, role: "student" });
    expect(dup.status).toBe(409);
    const bad = await request(app).post("/api/auth/login").send({ loginId: "12000001", password: "wrong-password" });
    const unknown = await request(app).post("/api/auth/login").send({ loginId: "99999999", password: PASSWORD });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error.message).toBe(unknown.body.error.message);
  });

  step("/me returns the login ID and never the password hash", async () => {
    const res = await request(app).get("/api/auth/me").set(auth(ctx.s1));
    expect(res.status).toBe(200);
    expect(res.body.user.loginId).toBe("12000001");
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenVersion/);
  });

  step("a student's registration number is their login ID", async () => {
    const res = await request(app).get("/api/students/me/profile").set(auth(ctx.s1));
    expect(res.body.profile.registrationNumber).toBe("12000001");
  });
});

describe("officer sets up an opportunity", () => {
  step("creates skills, a company and a draft opportunity with eligibility rules", async () => {
    const node = await request(app).post("/api/skills").set(auth(ctx.officer)).send({ name: "Node.js", category: "Framework" });
    const mongo = await request(app).post("/api/skills").set(auth(ctx.officer)).send({ name: "MongoDB", category: "Database" });
    expect(node.status).toBe(201);
    expect(mongo.status).toBe(201);
    ctx.nodeId = node.body.skill._id;
    ctx.mongoId = mongo.body.skill._id;

    const dupSkill = await request(app).post("/api/skills").set(auth(ctx.officer)).send({ name: "Node.js" });
    expect(dupSkill.status).toBe(409);

    const badEmail = await request(app).post("/api/companies").set(auth(ctx.officer)).send({ name: "Bad", contactEmail: "not-an-email" });
    expect(badEmail.status).toBe(422);
    const company = await request(app).post("/api/companies").set(auth(ctx.officer)).send({ name: "Acme", contactEmail: "HR@Acme.test" });
    expect(company.status).toBe(201);
    expect(company.body.company.contactEmail).toBe("hr@acme.test");

    const opp = await request(app).post("/api/opportunities").set(auth(ctx.officer)).send({
      companyId: company.body.company._id,
      role: "Backend Intern",
      requiredSkills: [
        { skillId: ctx.nodeId, minLevel: 4, weight: 0.5 },
        { skillId: ctx.mongoId, minLevel: 3, weight: 0.5 },
      ],
      eligibilityRule: { minCgpa: 7, eligibleDepartments: ["CSE"], eligibleBatchYears: [2026], maxBacklogs: 0 },
    });
    expect(opp.status).toBe(201);
    expect(opp.body.opportunity.status).toBe("draft");
    ctx.oppId = opp.body.opportunity._id;
  });

  step("hides the draft from students", async () => {
    const list = await request(app).get("/api/opportunities").set(auth(ctx.s1));
    expect(list.body.data).toHaveLength(0);
    expect((await request(app).get(`/api/opportunities/${ctx.oppId}`).set(auth(ctx.s1))).status).toBe(404);
    expect((await request(app).get(`/api/opportunities/${ctx.oppId}/readiness`).set(auth(ctx.s1))).status).toBe(404);
    // a company with no published opportunity is not visible to students either
    expect((await request(app).get("/api/companies").set(auth(ctx.s1))).body.data).toHaveLength(0);
  });

  step("publishes the opportunity", async () => {
    const res = await request(app).patch(`/api/opportunities/${ctx.oppId}/publish`).set(auth(ctx.officer));
    expect(res.status).toBe(200);
    expect(res.body.opportunity.status).toBe("published");

    const forStudent = await request(app).get("/api/companies").set(auth(ctx.s1));
    expect(forStudent.body.data).toHaveLength(1);
    expect(JSON.stringify(forStudent.body)).not.toMatch(/contactEmail|hr@acme/);
    const forOfficer = await request(app).get("/api/companies").set(auth(ctx.officer));
    expect(forOfficer.body.data[0].contactEmail).toBe("hr@acme.test");
  });

  step("rejects malformed ids with 400", async () => {
    const res = await request(app).get("/api/opportunities/not-an-id").set(auth(ctx.s1));
    expect(res.status).toBe(400);
  });
});

describe("student readiness (the MVP end-to-end workflow)", () => {
  step("eligible student with a partial skill set gets a transparent breakdown", async () => {
    const prof = await request(app).put("/api/students/me/profile").set(auth(ctx.s1))
      .send({ department: "CSE", batchYear: 2026, cgpa: 8.2, backlogs: 0 });
    expect(prof.status).toBe(200);
    const sk = await request(app).post("/api/students/me/skills").set(auth(ctx.s1)).send({ skillId: ctx.nodeId, selfReportedLevel: 2 });
    expect(sk.status).toBe(201);

    const res = await request(app).get(`/api/opportunities/${ctx.oppId}/readiness`).set(auth(ctx.s1));
    expect(res.status).toBe(200);
    expect(res.body.eligibility.eligible).toBe(true);
    expect(res.body.eligibility.verified).toBe(false); // provisional until the university verifies it
    expect(res.body.eligibility.checks).toHaveLength(4);
    // Node: 2/4 * 0.5 = 25%; MongoDB missing -> 0%
    expect(res.body.match.matchScore).toBe(25);
    const mongoRow = res.body.match.breakdown.find((b) => b.skillId === ctx.mongoId);
    expect(mongoRow.source).toBe("missing");
    const nodeRow = res.body.match.breakdown.find((b) => b.skillId === ctx.nodeId);
    expect(nodeRow.source).toBe("self");
    expect(res.body.recommendations).toHaveLength(2);
  });

  step("ineligible student still sees skill data, but eligibility fails on the right rule", async () => {
    await request(app).put("/api/students/me/profile").set(auth(ctx.s2))
      .send({ department: "CSE", batchYear: 2026, cgpa: 6.0, backlogs: 0 });
    const res = await request(app).get(`/api/opportunities/${ctx.oppId}/readiness`).set(auth(ctx.s2));
    expect(res.body.eligibility.eligible).toBe(false);
    expect(res.body.eligibility.checks.find((c) => c.rule === "minCgpa").passed).toBe(false);
    expect(res.body.eligibility.checks.find((c) => c.rule === "eligibleDepartments").passed).toBe(true);
    expect(res.body.match.matchScore).toBe(0);
  });

  step("records one history point and dedupes identical refreshes", async () => {
    await request(app).get(`/api/opportunities/${ctx.oppId}/readiness`).set(auth(ctx.s1));
    const hist = await request(app).get(`/api/opportunities/${ctx.oppId}/readiness-history`).set(auth(ctx.s1));
    expect(hist.status).toBe(200);
    expect(hist.body.data).toHaveLength(1);
    expect(hist.body.data[0].matchScore).toBe(25);
  });
});

describe("assessments", () => {
  async function makeAssessment(body, questions) {
    const a = await request(app).post("/api/assessments").set(auth(ctx.officer)).send(body);
    expect(a.status).toBe(201);
    const id = a.body.assessment._id;
    for (const q of questions) {
      const r = await request(app).post(`/api/assessments/${id}/questions`).set(auth(ctx.officer)).send(q);
      expect(r.status).toBe(201);
    }
    return id;
  }

  step("cannot publish an assessment with no questions; validates answer index", async () => {
    const a = await request(app).post("/api/assessments").set(auth(ctx.officer)).send({ title: "Empty", type: "technical" });
    const pub = await request(app).patch(`/api/assessments/${a.body.assessment._id}/publish`).set(auth(ctx.officer));
    expect(pub.status).toBe(422);
    const bad = await request(app).post(`/api/assessments/${a.body.assessment._id}/questions`).set(auth(ctx.officer))
      .send({ text: "Q", options: ["a", "b"], correctOptionIndex: 5 });
    expect(bad.status).toBe(422);
  });

  step("students cannot see unpublished assessments", async () => {
    ctx.assessA = await makeAssessment(
      { title: "Node basics", type: "technical", skillId: ctx.nodeId, durationMinutes: 30 },
      [
        { text: "Q1", options: ["w", "right", "w"], correctOptionIndex: 1 },
        { text: "Q2", options: ["right", "w"], correctOptionIndex: 0 },
      ]
    );
    const before = await request(app).get("/api/assessments").set(auth(ctx.s1));
    expect(before.body.data.find((a) => a._id === ctx.assessA)).toBeUndefined();
    await request(app).patch(`/api/assessments/${ctx.assessA}/publish`).set(auth(ctx.officer)).expect(200);
    const after = await request(app).get("/api/assessments").set(auth(ctx.s1));
    expect(after.body.data.find((a) => a._id === ctx.assessA)).toBeDefined();
  });

  step("starting an attempt never leaks correct answers", async () => {
    const res = await request(app).post(`/api/assessments/${ctx.assessA}/start`).set(auth(ctx.s1));
    expect(res.status).toBe(201);
    expect(res.body.questions).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toMatch(/correctOptionIndex/);
    ctx.attemptA = res.body.attemptId;
    ctx.qA = res.body.questions;
    // Mongo does not guarantee result order, so look questions up by their text
    ctx.qByText = Object.fromEntries(res.body.questions.map((q) => [q.text, q]));
  });

  step("another student cannot submit someone else's attempt", async () => {
    const res = await request(app).post(`/api/assessments/attempts/${ctx.attemptA}/submit`).set(auth(ctx.s2))
      .send({ answers: ctx.qA.map((q) => ({ questionId: q._id, selectedOptionIndex: 0 })) });
    expect(res.status).toBe(404);
  });

  step("scoring updates the verified skill level and the readiness score", async () => {
    const answers = [
      { questionId: ctx.qByText.Q1._id, selectedOptionIndex: 1 },
      { questionId: ctx.qByText.Q2._id, selectedOptionIndex: 0 },
    ];
    const res = await request(app).post(`/api/assessments/attempts/${ctx.attemptA}/submit`).set(auth(ctx.s1)).send({ answers });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ score: 2, maxScore: 2 });

    const again = await request(app).post(`/api/assessments/attempts/${ctx.attemptA}/submit`).set(auth(ctx.s1)).send({ answers });
    expect(again.status).toBe(409);

    const ready = await request(app).get(`/api/opportunities/${ctx.oppId}/readiness`).set(auth(ctx.s1));
    const nodeRow = ready.body.match.breakdown.find((b) => b.skillId === ctx.nodeId);
    expect(nodeRow.source).toBe("verified");
    expect(nodeRow.actual).toBe(5);
    expect(ready.body.match.matchScore).toBe(50);

    const hist = await request(app).get(`/api/opportunities/${ctx.oppId}/readiness-history`).set(auth(ctx.s1));
    expect(hist.body.data.map((p) => p.matchScore)).toEqual([25, 50]);
  });

  step("questions from another assessment cannot inflate a score", async () => {
    ctx.assessB = await makeAssessment(
      { title: "Aptitude", type: "aptitude", durationMinutes: 10 },
      [{ text: "B1", options: ["right", "w"], correctOptionIndex: 0 }]
    );
    await request(app).patch(`/api/assessments/${ctx.assessB}/publish`).set(auth(ctx.officer)).expect(200);
    const start = await request(app).post(`/api/assessments/${ctx.assessB}/start`).set(auth(ctx.s1));
    // Submit only a question that belongs to assessment A, plus a duplicate of it
    const foreign = { questionId: ctx.qByText.Q2._id, selectedOptionIndex: 0 };
    const res = await request(app).post(`/api/assessments/attempts/${start.body.attemptId}/submit`).set(auth(ctx.s1))
      .send({ answers: [foreign, foreign] });
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(0);
    expect(res.body.maxScore).toBe(1);
  });
});

describe("university verification", () => {
  step("the registration number cannot be changed or borrowed; s2 inflates their CGPA", async () => {
    const borrow = await request(app).put("/api/students/me/profile").set(auth(ctx.s1)).send({ registrationNumber: "12000002" });
    expect(borrow.status).toBe(422);
    expect(borrow.body.error.message).toMatch(/cannot be changed/);
    // sending your own number back is harmless
    const own = await request(app).put("/api/students/me/profile").set(auth(ctx.s1)).send({ registrationNumber: "12000001" });
    expect(own.status).toBe(200);
    expect(own.body.profile.registrationNumber).toBe("12000001");
    // s2's official CGPA is 6.0, but they now claim 8.0 to get past the 7.0 cut-off
    const r2 = await request(app).put("/api/students/me/profile").set(auth(ctx.s2)).send({ cgpa: 8.0 });
    expect(r2.body.profile.cgpa).toBe(8);
  });

  step("officer imports the official academic records", async () => {
    const res = await request(app).post("/api/verification/records/import").set(auth(ctx.officer)).send({
      records: [
        { registrationNumber: "12000001", department: "CSE", batchYear: 2026, cgpa: 8.2, backlogs: 0 },
        { registrationNumber: "12000002", department: "CSE", batchYear: 2026, cgpa: 6.0, backlogs: 0 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ received: 2, created: 2 });
  });

  step("students submit for verification; a second submission is refused", async () => {
    for (const t of [ctx.s1, ctx.s2]) {
      const res = await request(app).post("/api/students/me/verification/submit").set(auth(t));
      expect(res.status).toBe(200);
      expect(res.body.verification.status).toBe("pending");
    }
    const again = await request(app).post("/api/students/me/verification/submit").set(auth(ctx.s1));
    expect(again.status).toBe(409);
  });

  step("the review queue shows each claim next to the official record and flags the mismatch", async () => {
    const res = await request(app).get("/api/verification/queue?status=pending").set(auth(ctx.officer));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    const s1 = res.body.data.find((d) => d.registrationNumber === "12000001");
    const s2 = res.body.data.find((d) => d.registrationNumber === "12000002");
    ctx.profile1 = s1.profileId;
    ctx.profile2 = s2.profileId;
    expect(s1.comparison.every((c) => c.match)).toBe(true);
    expect(s2.comparison.filter((c) => !c.match).map((c) => c.field)).toEqual(["cgpa"]);
    expect(s2.loginId).toBe("12000002");
  });

  step("until verified: students see a provisional result, officers get no eligible students", async () => {
    const ready = await request(app).get(`/api/opportunities/${ctx.oppId}/readiness`).set(auth(ctx.s1));
    expect(ready.body.eligibility.verified).toBe(false);
    expect(ready.body.eligibility.eligible).toBe(true); // provisional only
    const list = await request(app).get(`/api/analytics/opportunities/${ctx.oppId}/eligible-students`).set(auth(ctx.officer));
    expect(list.body.eligibleCount).toBe(0);
    expect(list.body.awaitingVerificationCount).toBe(2);
    const csv = await request(app).get(`/api/analytics/opportunities/${ctx.oppId}/eligible-students/export`).set(auth(ctx.officer));
    expect(csv.text).not.toContain("12000001");
  });

  step("students never see who reviewed them", async () => {
    const res = await request(app).get("/api/students/me/profile").set(auth(ctx.s1));
    expect(JSON.stringify(res.body)).not.toMatch(/reviewedBy|verifiedSnapshot/);
  });

  step("approval stores the OFFICIAL values, replacing the inflated claim", async () => {
    const a1 = await request(app).post(`/api/verification/${ctx.profile1}/approve`).set(auth(ctx.officer)).send({});
    expect(a1.status).toBe(200);
    expect(a1.body.verified.cgpa).toBe(8.2);
    const a2 = await request(app).post(`/api/verification/${ctx.profile2}/approve`).set(auth(ctx.officer)).send({});
    expect(a2.status).toBe(200);
    expect(a2.body.verified.cgpa).toBe(6);
    const p2 = await request(app).get("/api/students/me/profile").set(auth(ctx.s2));
    expect(p2.body.profile.cgpa).toBe(6);
    expect(p2.body.profile.verification.status).toBe("verified");
  });

  step("the student who inflated their CGPA is now correctly ineligible; the honest one is eligible", async () => {
    const r2 = await request(app).get(`/api/opportunities/${ctx.oppId}/readiness`).set(auth(ctx.s2));
    expect(r2.body.eligibility.verified).toBe(true);
    expect(r2.body.eligibility.eligible).toBe(false);
    expect(r2.body.eligibility.checks.find((c) => c.rule === "minCgpa")).toMatchObject({ actual: 6, passed: false });
    const r1 = await request(app).get(`/api/opportunities/${ctx.oppId}/readiness`).set(auth(ctx.s1));
    expect(r1.body.eligibility.verified).toBe(true);
    expect(r1.body.eligibility.eligible).toBe(true);
  });

  step("editing academic details resets verification; re-approval restores the official values", async () => {
    const edit = await request(app).put("/api/students/me/profile").set(auth(ctx.s1)).send({ cgpa: 9.9 });
    expect(edit.body.profile.verification.status).toBe("unverified");
    const ready = await request(app).get(`/api/opportunities/${ctx.oppId}/readiness`).set(auth(ctx.s1));
    expect(ready.body.eligibility.verified).toBe(false);

    await request(app).post("/api/students/me/verification/submit").set(auth(ctx.s1)).expect(200);
    const approved = await request(app).post(`/api/verification/${ctx.profile1}/approve`).set(auth(ctx.officer)).send({});
    expect(approved.body.verified.cgpa).toBe(8.2);

    // re-saving the same values (even different case) must not reset anything
    const same = await request(app).put("/api/students/me/profile").set(auth(ctx.s1)).send({ cgpa: 8.2, department: "cse" });
    expect(same.body.profile.verification.status).toBe("verified");
  });

  step("the audit trail records every step in order, with who did it", async () => {
    const res = await request(app).get(`/api/verification/${ctx.profile1}/history`).set(auth(ctx.officer));
    expect(res.body.data.map((l) => l.action)).toEqual(["submitted", "approved", "reset", "submitted", "approved"]);
    expect(res.body.data[1].actorUserId.loginId).toBe("50001");
  });
});

describe("officer analytics", () => {
  step("overview counts students, published opportunities and assessment participation", async () => {
    const res = await request(app).get("/api/analytics/overview").set(auth(ctx.officer));
    expect(res.status).toBe(200);
    expect(res.body.totalStudents).toBe(2);
    expect(res.body.publishedOpportunities).toBe(1);
    expect(res.body.studentsWithSubmittedAssessment).toBe(1);
    expect(res.body.assessmentParticipationPct).toBe(50);
    expect(res.body.verification).toEqual({ verified: 2, pending: 0, rejected: 0, unverified: 0 });
  });

  step("batch summary aggregates cohort size and average CGPA", async () => {
    const res = await request(app).get("/api/analytics/batches/summary").set(auth(ctx.officer));
    const batch = res.body.data.find((b) => b.batchYear === 2026);
    expect(batch.students).toBe(2);
    expect(batch.avgCgpa).toBe(7.1); // (8.2 + 6.0) / 2, taken from the VERIFIED values
    expect(res.body.excludedUnverified).toBe(0);
  });

  step("lists eligible students ranked by match score", async () => {
    const res = await request(app).get(`/api/analytics/opportunities/${ctx.oppId}/eligible-students`).set(auth(ctx.officer));
    expect(res.body.totalCandidates).toBe(2);
    expect(res.body.eligibleCount).toBe(1);
    expect(res.body.data[0].matchScore).toBe(50);
    expect(res.body.awaitingVerificationCount).toBe(0);
  });

  step("reports common skill gaps by skill name", async () => {
    const res = await request(app).get(`/api/analytics/skill-gaps/common?opportunityId=${ctx.oppId}`).set(auth(ctx.officer));
    expect(res.body.data[0]).toMatchObject({ skillName: "MongoDB", studentsWithGap: 2 });
  });

  step("exports eligible students as CSV (and only eligible ones)", async () => {
    const res = await request(app).get(`/api/analytics/opportunities/${ctx.oppId}/eligible-students/export`).set(auth(ctx.officer));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.text).toMatch(/^registrationNumber,department,batchYear,cgpa,backlogs,matchScorePct/);
    expect(res.text).toContain("12000001");
    expect(res.text).not.toContain("12000002");
    expect(res.text).not.toMatch(/@/); // no email addresses in the export
  });

  step("students cannot reach analytics or the export", async () => {
    expect((await request(app).get("/api/analytics/overview").set(auth(ctx.s1))).status).toBe(403);
    expect((await request(app).get(`/api/analytics/opportunities/${ctx.oppId}/eligible-students/export`).set(auth(ctx.s1))).status).toBe(403);
  });
});

describe("account edge cases and recovery", () => {
  step("incomplete details cannot be submitted (the response lists what is missing)", async () => {
    ctx.s3 = await signUp("12000003", "student");
    const res = await request(app).post("/api/students/me/verification/submit").set(auth(ctx.s3));
    expect(res.status).toBe(422);
    expect(res.body.error.details.missing.sort()).toEqual(["batchYear", "cgpa", "department"]);
  });

  step("without an official record the officer must explicitly confirm a manual document check", async () => {
    await request(app).put("/api/students/me/profile").set(auth(ctx.s3))
      .send({ department: "CSE", batchYear: 2026, cgpa: 8.2, backlogs: 0 }).expect(200);
    await request(app).post("/api/students/me/verification/submit").set(auth(ctx.s3)).expect(200);
    const queue = await request(app).get("/api/verification/queue?status=pending").set(auth(ctx.officer));
    ctx.profile3 = queue.body.data.find((d) => d.loginId === "12000003").profileId;

    const refused = await request(app).post(`/api/verification/${ctx.profile3}/approve`).set(auth(ctx.officer)).send({});
    expect(refused.status).toBe(422);
    expect(refused.body.error.message).toMatch(/manualCheck/);

    const ok = await request(app).post(`/api/verification/${ctx.profile3}/approve`).set(auth(ctx.officer)).send({ manualCheck: true });
    expect(ok.status).toBe(200);
    expect(ok.body.verified.cgpa).toBe(8.2);
  });

  step("rejection needs a reason, works as a revoke on verified profiles, and the student sees why", async () => {
    const noReason = await request(app).post(`/api/verification/${ctx.profile3}/reject`).set(auth(ctx.officer)).send({});
    expect(noReason.status).toBe(422);

    const res = await request(app).post(`/api/verification/${ctx.profile3}/reject`).set(auth(ctx.officer))
      .send({ reason: "Documents did not match" });
    expect(res.status).toBe(200);
    expect(res.body.verification.status).toBe("rejected");

    const prof = await request(app).get("/api/students/me/profile").set(auth(ctx.s3));
    expect(prof.body.profile.verification).toMatchObject({ status: "rejected", rejectionReason: "Documents did not match" });

    const again = await request(app).post(`/api/verification/${ctx.profile3}/reject`).set(auth(ctx.officer))
      .send({ reason: "Already rejected" });
    expect(again.status).toBe(409);
  });

  step("a rejected student can fix their details and resubmit", async () => {
    const res = await request(app).post("/api/students/me/verification/submit").set(auth(ctx.s3));
    expect(res.status).toBe(200);
    expect(res.body.verification.status).toBe("pending");
  });

  step("officer password reset: signs out every old session, forces a change, and the temporary password works once", async () => {
    const oldToken = ctx.s3;
    await request(app).get("/api/students/me/profile").set(auth(oldToken)).expect(200);

    const reset = await request(app).post(`/api/verification/${ctx.profile3}/reset-password`).set(auth(ctx.officer));
    expect(reset.status).toBe(200);
    expect(reset.body.loginId).toBe("12000003");
    expect(reset.headers["cache-control"]).toMatch(/no-store/);
    const temp = reset.body.temporaryPassword;
    expect(temp).toHaveLength(12);

    // every existing session (including a squatter's) is dead, and the old password no longer works
    expect((await request(app).get("/api/students/me/profile").set(auth(oldToken))).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ loginId: "12000003", password: PASSWORD })).status).toBe(401);

    // the temporary password logs in, but only lets the user change their password
    const login = await request(app).post("/api/auth/login").send({ loginId: "12000003", password: temp });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
    const tempToken = login.body.token;
    expect((await request(app).get("/api/students/me/profile").set(auth(tempToken))).status).toBe(403);

    const wrong = await request(app).post("/api/auth/change-password").set(auth(tempToken))
      .send({ currentPassword: "not-the-temp-pw", newPassword: "BrandNew#Pass1" });
    expect(wrong.status).toBe(401);
    const changed = await request(app).post("/api/auth/change-password").set(auth(tempToken))
      .send({ currentPassword: temp, newPassword: "BrandNew#Pass1" });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);

    // the temporary session is dead, the fresh one works, and the temporary password cannot be reused
    expect((await request(app).get("/api/students/me/profile").set(auth(tempToken))).status).toBe(401);
    expect((await request(app).get("/api/students/me/profile").set(auth(changed.body.token))).status).toBe(200);
    expect((await request(app).post("/api/auth/login").send({ loginId: "12000003", password: temp })).status).toBe(401);
  });

  step("students cannot reset passwords, and the audit log never contains the password", async () => {
    expect((await request(app).post(`/api/verification/${ctx.profile3}/reset-password`).set(auth(ctx.s1))).status).toBe(403);
    const hist = await request(app).get(`/api/verification/${ctx.profile3}/history`).set(auth(ctx.officer));
    const entry = hist.body.data.find((l) => l.action === "password_reset");
    expect(entry).toBeDefined();
    expect(entry.actorUserId.loginId).toBe("50001");
    expect(JSON.stringify(hist.body)).not.toMatch(/temporaryPassword|BrandNew/);
  });
});

describe("certificates and MOOCs", () => {
  const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
  const binary = (res, cb) => { const chunks = []; res.on("data", (c) => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks))); };
  const add = (token, fields = {}, file = PDF) => {
    let r = request(app).post("/api/students/me/credentials").set(auth(token))
      .field("type", fields.type || "mooc").field("title", fields.title || "Machine Learning").field("issuer", fields.issuer || "Coursera");
    if (fields.link) r = r.field("link", fields.link);
    if (file) r = r.attach("certificate", file, { filename: "cert.pdf", contentType: "application/pdf" });
    return r;
  };

  step("a student adds a certificate with a PDF and a Drive link", async () => {
    const res = await add(ctx.s1, { link: "https://drive.google.com/file/d/1AbC/view?usp=sharing" });
    expect(res.status).toBe(201);
    expect(res.body.credential).toMatchObject({ status: "pending", hasFile: true, linkHost: "drive.google.com", linkKnown: true });
    ctx.cert1 = res.body.credential.id;
    const mine = await request(app).get("/api/students/me/credentials").set(auth(ctx.s1));
    expect(mine.body.data).toHaveLength(1);
  });

  step("unsafe links and fake PDFs are refused; the same file twice is refused", async () => {
    expect((await add(ctx.s1, { link: "javascript:alert(1)" }, null)).status).toBe(422);
    expect((await add(ctx.s1, { title: "Fake" }, Buffer.from("<html>not a pdf</html>"))).status).toBe(422);
    expect((await add(ctx.s1, { title: "Dup" })).status).toBe(409);
  });

  step("the same PDF from a second student is accepted but flagged to faculty", async () => {
    const res = await add(ctx.s2, { title: "Same file, different student" });
    expect(res.status).toBe(201);
    ctx.cert2 = res.body.credential.id;

    const list = await request(app).get("/api/credentials?status=pending").set(auth(ctx.officer));
    expect(list.status).toBe(200);
    const first = list.body.data.find((c) => c.id === ctx.cert1);
    expect(first).toMatchObject({ registrationNumber: "12000001", sharedFileWithOtherStudents: 1 });
    expect(JSON.stringify(list.body)).not.toMatch(/sha256|reviewedBy/);

    const overview = await request(app).get("/api/analytics/overview").set(auth(ctx.officer));
    expect(overview.body.pendingCredentials).toBe(2);
  });

  step("the officer opens the PDF in one request: exact bytes, shown inline", async () => {
    const res = await request(app).get(`/api/credentials/${ctx.cert1}/file`).set(auth(ctx.officer)).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toMatch(/^inline;/);
    expect(Buffer.compare(res.body, PDF)).toBe(0);
  });

  step("students cannot open each other's PDFs, and cannot review", async () => {
    expect((await request(app).get(`/api/students/me/credentials/${ctx.cert1}/file`).set(auth(ctx.s2))).status).toBe(404);
    expect((await request(app).post(`/api/credentials/${ctx.cert1}/approve`).set(auth(ctx.s2))).status).toBe(403);
  });

  step("the officer can filter by student, approve, and reject with a reason the student sees", async () => {
    const filtered = await request(app).get(`/api/credentials?status=all&profileId=${ctx.profile1}`).set(auth(ctx.officer));
    expect(filtered.body.data.map((c) => c.id)).toEqual([ctx.cert1]);

    const ok = await request(app).post(`/api/credentials/${ctx.cert1}/approve`).set(auth(ctx.officer));
    expect(ok.body.credential.status).toBe("verified");
    const rej = await request(app).post(`/api/credentials/${ctx.cert2}/reject`).set(auth(ctx.officer)).send({ reason: "Certificate belongs to someone else" });
    expect(rej.body.credential.status).toBe("rejected");

    const mine = await request(app).get("/api/students/me/credentials").set(auth(ctx.s2));
    expect(mine.body.data[0]).toMatchObject({ status: "rejected", rejectionReason: "Certificate belongs to someone else" });
    expect(JSON.stringify(mine.body)).not.toMatch(/reviewedBy/);
  });

  step("deleting a certificate removes its PDF too", async () => {
    expect((await request(app).delete(`/api/students/me/credentials/${ctx.cert1}`).set(auth(ctx.s1))).status).toBe(200);
    expect((await request(app).get(`/api/credentials/${ctx.cert1}/file`).set(auth(ctx.officer))).status).toBe(404);
    const mine = await request(app).get("/api/students/me/credentials").set(auth(ctx.s1));
    expect(mine.body.data).toHaveLength(0);
  });
});

describe("evidence-backed skills and the what-if simulator", () => {
  // s1 is verified and eligible; Node.js is assessment-verified; MongoDB has no evidence yet (role needs Node 4, Mongo 3)
  const readiness = async () => (await request(app).get(`/api/opportunities/${ctx.oppId}/readiness`).set(auth(ctx.s1))).body;
  const mongoRow = (r) => r.match.breakdown.find((b) => b.skillId === ctx.mongoId);

  step("the simulator names the one missing skill and what it is worth", async () => {
    const res = await request(app).get("/api/students/me/what-if/next-skills").set(auth(ctx.s1));
    expect(res.status).toBe(200);
    expect(res.body.provisional).toBe(false); // s1's academic details are verified
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ skillName: "MongoDB", currentLevel: 0, targetLevel: 3, totalLift: 50, rolesImproved: 1 });
  });

  step("simulating changes nothing in the database", async () => {
    const sim = await request(app).post("/api/students/me/what-if").set(auth(ctx.s1)).send({ opportunityId: ctx.oppId, changes: [{ skillId: ctx.mongoId, level: 3 }] });
    expect(sim.body).toMatchObject({ baselineScore: 50, scenarioScore: 100, delta: 50 });
    expect((await readiness()).match.matchScore).toBe(50); // the real score is untouched
  });

  step("a certificate linked to a skill counts for nothing until faculty verify it", async () => {
    const res = await request(app).post("/api/students/me/credentials").set(auth(ctx.s1))
      .field("type", "certification").field("title", "MongoDB Basics").field("issuer", "MongoDB University")
      .field("link", "https://learn.mongodb.com/c/demo").field("skillId", ctx.mongoId).field("skillLevel", "4");
    expect(res.status).toBe(201);
    expect(res.body.credential.skill.id).toBe(ctx.mongoId);
    ctx.evidenceCert = res.body.credential.id;
    expect(mongoRow(await readiness()).source).toBe("missing");
  });

  step("once verified, it backs the skill, capped at level 3 even though faculty awarded 5", async () => {
    const ok = await request(app).post(`/api/credentials/${ctx.evidenceCert}/approve`).set(auth(ctx.officer)).send({ awardedLevel: 5 });
    expect(ok.status).toBe(200);
    expect(ok.body.credential.awardedLevel).toBe(5);
    const r = await readiness();
    expect(mongoRow(r)).toMatchObject({ source: "certificate", actual: 3, evidence: { certificate: 3, assessment: null, self: null } });
    expect(r.match.matchScore).toBe(100);
  });

  step("the simulator now finds nothing left to recommend", async () => {
    const res = await request(app).get("/api/students/me/what-if/next-skills").set(auth(ctx.s1));
    expect(res.body.data).toEqual([]);
  });

  step("rejecting the certificate removes the evidence again", async () => {
    const rej = await request(app).post(`/api/credentials/${ctx.evidenceCert}/reject`).set(auth(ctx.officer)).send({ reason: "Name does not match" });
    expect(rej.status).toBe(200);
    expect(mongoRow(await readiness()).source).toBe("missing");
  });

  step("officer analytics use the same evidence rules", async () => {
    await request(app).post(`/api/credentials/${ctx.evidenceCert}/approve`).set(auth(ctx.officer)).send({ awardedLevel: 3 }).expect(200);
    const res = await request(app).get(`/api/analytics/opportunities/${ctx.oppId}/eligible-students`).set(auth(ctx.officer));
    expect(res.body.data[0].matchScore).toBe(100);
  });
});

describe("resume, verification link and PDF", () => {
  const binary = (res, cb) => { const chunks = []; res.on("data", (c) => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks))); };
  const resumeBody = {
    fullName: "Student One", summary: "Backend student.", contact: { email: "s1@example.com", github: "https://GitHub.com/s1" },
    projects: [{ title: "Matcher", description: "Built with MongoDB.", techStack: ["Node.js"] }],
  };

  step("the preview is built from verified data, ignoring anything typed in", async () => {
    const res = await request(app).put("/api/students/me/resume").set(auth(ctx.s1)).send({ ...resumeBody, cgpa: 10 });
    expect(res.status).toBe(200);
    expect(res.body.preview.education).toMatchObject({ verified: true, cgpa: 8.2, department: "CSE" });
    expect(res.body.resume.contact.github).toBe("https://github.com/s1");
    const skills = Object.fromEntries(res.body.preview.skills.map((s) => [s.name, s.evidence]));
    expect(skills).toMatchObject({ "Node.js": "assessment", MongoDB: "certificate" });
  });

  step("the role check finds the skills on the resume", async () => {
    const res = await request(app).get(`/api/students/me/resume/check/${ctx.oppId}`).set(auth(ctx.s1));
    expect(res.status).toBe(200);
    expect(res.body.coveragePct).toBe(100);
  });

  step("a verification link: shown once, stored hashed, open to a recruiter with no login", async () => {
    const made = await request(app).post("/api/students/me/resume/shares").set(auth(ctx.s1)).send({ expiresInDays: 7, showCgpa: true });
    expect(made.status).toBe(201);
    ctx.shareToken = made.body.token;
    ctx.shareId = made.body.share.id;

    const pub = await request(app).get(`/api/public/verify/${ctx.shareToken}`); // no Authorization header
    expect(pub.status).toBe(200);
    expect(pub.body.academic).toMatchObject({ status: "verified", department: "CSE", cgpa: 8.2 });
    expect(pub.body.skills.map((s) => s.name).sort()).toEqual(["MongoDB", "Node.js"]);
    expect(JSON.stringify(pub.body)).not.toMatch(/s1@example|github|Backend student|Matcher|12000001/);

    const list = await request(app).get("/api/students/me/resume/shares").set(auth(ctx.s1));
    expect(list.body.data[0].viewCount).toBe(1);
    expect(JSON.stringify(list.body)).not.toContain(ctx.shareToken);
  });

  step("the PDF downloads, with and without the link", async () => {
    const plain = await request(app).post("/api/students/me/resume/pdf").set(auth(ctx.s1)).send({}).buffer(true).parse(binary);
    const linked = await request(app).post("/api/students/me/resume/pdf").set(auth(ctx.s1)).send({ shareToken: ctx.shareToken }).buffer(true).parse(binary);
    expect(plain.headers["content-type"]).toBe("application/pdf");
    expect(plain.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(linked.body.length).toBeGreaterThan(plain.body.length);
  });

  step("a revoked link, a made-up link and another student's resume all look the same to a recruiter", async () => {
    await request(app).delete(`/api/students/me/resume/shares/${ctx.shareId}`).set(auth(ctx.s1)).expect(200);
    const revoked = await request(app).get(`/api/public/verify/${ctx.shareToken}`);
    const unknown = await request(app).get(`/api/public/verify/${"Z".repeat(43)}`);
    expect(revoked.status).toBe(404);
    expect(revoked.body).toEqual(unknown.body);
  });

  step("if the university withdraws verification, a still-active link stops vouching for the numbers", async () => {
    const made = await request(app).post("/api/students/me/resume/shares").set(auth(ctx.s1)).send({});
    await request(app).post(`/api/verification/${ctx.profile1}/reject`).set(auth(ctx.officer)).send({ reason: "Re-check needed" }).expect(200);
    const pub = await request(app).get(`/api/public/verify/${made.body.token}`);
    expect(pub.status).toBe(200);
    expect(pub.body.academic.status).toBe("unverified");
    expect(JSON.stringify(pub.body.academic)).not.toMatch(/8\.2|CSE/);
  });
});
