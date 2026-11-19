const { certificateCap, certificateLevels, mergeEvidence, DEFAULT_CAP } = require("../src/services/evidenceService");
const { computeMatch, resolveLevel } = require("../src/services/matchingService");
const { generateRecommendations } = require("../src/services/recommendationService");

describe("certificateCap", () => {
  test("defaults to 3: a certificate shows exposure, not mastery", () => {
    expect(DEFAULT_CAP).toBe(3);
    expect(certificateCap({})).toBe(3);
  });
  test.each([["1", 1], ["4", 4], ["5", 5]])("CERTIFICATE_LEVEL_CAP=%s -> %i", (v, expected) => {
    expect(certificateCap({ CERTIFICATE_LEVEL_CAP: v })).toBe(expected);
  });
  test.each(["0", "6", "-1", "abc", "", "2.5x"])("ignores an invalid value %j", (v) => {
    expect(certificateCap({ CERTIFICATE_LEVEL_CAP: v })).toBe(3);
  });
});

describe("certificateLevels", () => {
  const cert = (o) => ({ status: "verified", skillId: "node", awardedLevel: 4, ...o });

  test("only FACULTY-VERIFIED certificates count", () => {
    for (const status of ["pending", "rejected"]) {
      expect(certificateLevels([cert({ status })]).size).toBe(0);
    }
    expect(certificateLevels([cert({})]).get("node")).toBe(3);
  });

  test("the awarded level is capped", () => {
    expect(certificateLevels([cert({ awardedLevel: 5 })]).get("node")).toBe(3);
    expect(certificateLevels([cert({ awardedLevel: 2 })]).get("node")).toBe(2);
    expect(certificateLevels([cert({ awardedLevel: 5 })], 5).get("node")).toBe(5);
  });

  test("takes the best certificate per skill and keeps skills separate", () => {
    const out = certificateLevels([cert({ awardedLevel: 2 }), cert({ awardedLevel: 3 }), cert({ skillId: "mongo", awardedLevel: 1 })]);
    expect(out.get("node")).toBe(3);
    expect(out.get("mongo")).toBe(1);
  });

  test("ignores certificates with no skill or no awarded level", () => {
    expect(certificateLevels([cert({ skillId: undefined }), cert({ awardedLevel: undefined }), cert({ awardedLevel: 0 })]).size).toBe(0);
  });

  test("accepts a populated skill reference", () => {
    expect(certificateLevels([cert({ skillId: { _id: "node", name: "Node.js" } })]).get("node")).toBe(3);
  });
});

describe("mergeEvidence", () => {
  test("adds certificate levels to existing skills and creates entries for new ones", () => {
    const skills = [{ skillId: "node", selfReportedLevel: 2, verifiedLevel: null }];
    const merged = mergeEvidence(skills, new Map([["node", 3], ["mongo", 2]]));
    const byId = Object.fromEntries(merged.map((m) => [m.skillId, m]));
    expect(byId.node).toMatchObject({ selfReportedLevel: 2, certificateLevel: 3 });
    expect(byId.mongo).toMatchObject({ selfReportedLevel: null, verifiedLevel: null, certificateLevel: 2 });
  });

  test("does not mutate its inputs", () => {
    const skills = [{ skillId: "node", selfReportedLevel: 2, verifiedLevel: null }];
    mergeEvidence(skills, new Map([["node", 3]]));
    expect(skills[0]).not.toHaveProperty("certificateLevel");
  });
});

describe("resolveLevel: which evidence wins", () => {
  test.each([
    ["nothing on file", {}, 0, "missing"],
    ["self only", { selfReportedLevel: 4 }, 4, "self"],
    ["certificate only", { certificateLevel: 3 }, 3, "certificate"],
    ["assessment only", { verifiedLevel: 2 }, 2, "verified"],
    ["assessment beats a higher self claim", { verifiedLevel: 2, selfReportedLevel: 5 }, 2, "verified"],
    ["assessment beats a certificate", { verifiedLevel: 1, certificateLevel: 3 }, 1, "verified"],
    ["certificate >= self upgrades the row to 'certificate'", { certificateLevel: 3, selfReportedLevel: 2 }, 3, "certificate"],
    ["certificate equal to self is labelled 'certificate'", { certificateLevel: 3, selfReportedLevel: 3 }, 3, "certificate"],
    ["a higher self claim is NOT lowered by a weaker certificate", { certificateLevel: 2, selfReportedLevel: 4 }, 4, "self"],
  ])("%s", (_n, input, actual, source) => {
    expect(resolveLevel(input)).toEqual({ actual, source });
  });

  test("adding a certificate never lowers the level, for every combination", () => {
    const levels = [null, 1, 2, 3, 4, 5];
    for (const self of levels) for (const verified of levels) for (const cert of [1, 2, 3]) {
      const without = resolveLevel({ selfReportedLevel: self, verifiedLevel: verified }).actual;
      const withCert = resolveLevel({ selfReportedLevel: self, verifiedLevel: verified, certificateLevel: cert }).actual;
      expect(withCert).toBeGreaterThanOrEqual(without);
    }
  });
});

describe("computeMatch with certificate evidence", () => {
  const req = [{ skillId: "node", minLevel: 4, weight: 0.5 }, { skillId: "mongo", minLevel: 3, weight: 0.5 }];

  test("a verified certificate raises a missing skill, and the row says why", () => {
    const base = computeMatch(req, [{ skillId: "node", verifiedLevel: 4 }]);
    const withCert = computeMatch(req, [{ skillId: "node", verifiedLevel: 4 }, { skillId: "mongo", certificateLevel: 3 }]);
    expect(base.matchScore).toBe(50);
    expect(withCert.matchScore).toBe(100);
    const row = withCert.breakdown.find((b) => b.skillId === "mongo");
    expect(row).toMatchObject({ source: "certificate", actual: 3, evidence: { certificate: 3, self: null, assessment: null } });
  });

  test("the breakdown exposes every tier on file", () => {
    const row = computeMatch(req, [{ skillId: "node", selfReportedLevel: 4, certificateLevel: 3, verifiedLevel: 2 }]).breakdown[0];
    expect(row.evidence).toEqual({ assessment: 2, certificate: 3, self: 4 });
    expect(row.source).toBe("verified");
  });

  test("evidence can never reduce the overall score", () => {
    const levels = [null, 1, 2, 3, 4, 5];
    for (const self of levels) for (const cert of [1, 2, 3]) {
      const a = computeMatch(req, [{ skillId: "node", selfReportedLevel: self }]).matchScore;
      const b = computeMatch(req, [{ skillId: "node", selfReportedLevel: self, certificateLevel: cert }]).matchScore;
      expect(b).toBeGreaterThanOrEqual(a);
    }
  });
});

describe("recommendations by evidence tier", () => {
  const row = (source, actual) => ({ skillId: "s", required: 4, actual, source });
  test.each([
    ["missing", 0, /No evidence yet/],
    ["self", 2, /Self-reported level 2.*assessment or a faculty-verified certificate/],
    ["certificate", 3, /Certificate-backed level 3.*assessment or add a higher-level certificate/],
    ["verified", 3, /Assessment-verified level 3.*retake the assessment/],
  ])("%s", (source, actual, pattern) => {
    expect(generateRecommendations([row(source, actual)])[0].suggestedAction).toMatch(pattern);
  });

  test("skills that already meet the requirement produce no recommendation; biggest gap first", () => {
    const out = generateRecommendations([
      { skillId: "ok", required: 3, actual: 3, source: "self" },
      { skillId: "small", required: 4, actual: 3, source: "self" },
      { skillId: "big", required: 5, actual: 1, source: "missing" },
    ]);
    expect(out.map((r) => r.skillId)).toEqual(["big", "small"]);
  });
});
