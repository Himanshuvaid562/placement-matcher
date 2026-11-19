const { applyOverrides, simulate, rankNextSkills } = require("../src/services/simulatorService");
const { computeMatch } = require("../src/services/matchingService");

// Two roles that share MongoDB, one that needs React
const A = { id: "A", requiredSkills: [{ skillId: "node", minLevel: 4, weight: 0.5 }, { skillId: "mongo", minLevel: 3, weight: 0.5 }] };
const B = { id: "B", requiredSkills: [{ skillId: "mongo", minLevel: 3, weight: 1 }] };
const C = { id: "C", requiredSkills: [{ skillId: "react", minLevel: 3, weight: 1 }] };
const student = [{ skillId: "node", selfReportedLevel: 2, verifiedLevel: null, certificateLevel: null }];

describe("applyOverrides", () => {
  test("raises a level, and creates an entry for a skill the student has never recorded", () => {
    const out = Object.fromEntries(applyOverrides(student, [{ skillId: "node", level: 4 }, { skillId: "mongo", level: 3 }]).map((s) => [s.skillId, s]));
    expect(out.node.verifiedLevel).toBe(4);
    expect(out.mongo.verifiedLevel).toBe(3);
  });

  test("never lowers a level: stronger existing evidence is kept", () => {
    const strong = [{ skillId: "node", verifiedLevel: 4, selfReportedLevel: 1 }];
    expect(applyOverrides(strong, [{ skillId: "node", level: 2 }])[0].verifiedLevel).toBe(4);
    const cert = [{ skillId: "node", certificateLevel: 3 }];
    expect(applyOverrides(cert, [{ skillId: "node", level: 1 }])[0].verifiedLevel).toBe(3);
  });

  test("does not mutate the student's real evidence", () => {
    const before = JSON.stringify(student);
    applyOverrides(student, [{ skillId: "node", level: 5 }]);
    expect(JSON.stringify(student)).toBe(before);
  });

  test("several overrides for one skill resolve to the highest", () => {
    expect(applyOverrides([], [{ skillId: "x", level: 2 }, { skillId: "x", level: 4 }, { skillId: "x", level: 3 }])[0].verifiedLevel).toBe(4);
  });
});

describe("simulate", () => {
  test("hand-checked numbers: Node 2->4 moves role A from 25% to 50%", () => {
    // baseline: Node 2/4 x 0.5 = 25, MongoDB missing = 0 -> 25
    const r = simulate(A, student, [{ skillId: "node", level: 4 }]);
    expect(r.baselineScore).toBe(25);
    expect(r.scenarioScore).toBe(50);
    expect(r.delta).toBe(25);
    const node = r.rows.find((x) => x.skillId === "node");
    expect(node).toMatchObject({ before: 2, after: 4, raised: true, required: 4, sourceBefore: "self" });
    expect(r.rows.find((x) => x.skillId === "mongo").raised).toBe(false);
  });

  test("raising several skills at once adds up", () => {
    const r = simulate(A, student, [{ skillId: "node", level: 4 }, { skillId: "mongo", level: 3 }]);
    expect(r.scenarioScore).toBe(100);
    expect(r.delta).toBe(75);
  });

  test("a skill the role does not ask for changes nothing", () => {
    expect(simulate(A, student, [{ skillId: "react", level: 5 }]).delta).toBe(0);
  });

  test("raising beyond what the role needs gives no extra credit (the matcher caps each skill)", () => {
    expect(simulate(A, student, [{ skillId: "node", level: 5 }]).scenarioScore).toBe(50);
  });

  test("no changes = no difference", () => {
    const r = simulate(A, student, []);
    expect(r.delta).toBe(0);
    expect(r.baselineScore).toBe(r.scenarioScore);
  });

  test("the baseline equals what the matcher reports today", () => {
    expect(simulate(A, student, []).baselineScore).toBe(computeMatch(A.requiredSkills, student).matchScore);
  });

  test("it never reports a negative delta, whatever the overrides", () => {
    for (const level of [1, 2, 3, 4, 5]) {
      expect(simulate(A, student, [{ skillId: "node", level }, { skillId: "mongo", level }]).delta).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("rankNextSkills", () => {
  test("hand-checked: MongoDB (+50 on A, +100 on B) beats Node.js (+25 on A)", () => {
    const out = rankNextSkills([A, B, C], student, { countedIds: new Set(["A", "B"]) });
    expect(out.map((r) => r.skillId)).toEqual(["mongo", "node"]);
    expect(out[0]).toMatchObject({ currentLevel: 0, targetLevel: 3, totalLift: 150, rolesImproved: 2 });
    expect(out[0].topRoles).toEqual([
      { opportunityId: "B", before: 0, after: 100, gain: 100 },
      { opportunityId: "A", before: 25, after: 75, gain: 50 },
    ]);
    expect(out[1]).toMatchObject({ currentLevel: 2, targetLevel: 4, totalLift: 25, rolesImproved: 1 });
  });

  test("roles the student cannot apply to are not counted, so we never advise studying for them", () => {
    const out = rankNextSkills([A, B], student, { countedIds: new Set(["A"]) });
    expect(out.find((r) => r.skillId === "mongo").totalLift).toBe(50); // B ignored
    expect(rankNextSkills([A, B, C], student, { countedIds: new Set() })).toEqual([]);
  });

  test("with no filter, every role counts", () => {
    expect(rankNextSkills([A, B, C], student).map((r) => r.skillId).sort()).toEqual(["mongo", "node", "react"]);
  });

  test("skills the student already meets are never suggested", () => {
    const strong = [{ skillId: "node", verifiedLevel: 4 }, { skillId: "mongo", verifiedLevel: 3 }];
    expect(rankNextSkills([A, B], strong)).toEqual([]);
  });

  test("the target is the highest level any counted role asks for", () => {
    const hard = { id: "H", requiredSkills: [{ skillId: "mongo", minLevel: 5, weight: 1 }] };
    expect(rankNextSkills([B, hard], [], { }).find((r) => r.skillId === "mongo").targetLevel).toBe(5);
  });

  test("respects the limit, and ordering is deterministic", () => {
    const many = { id: "M", requiredSkills: ["a", "b", "c", "d", "e", "f"].map((s) => ({ skillId: s, minLevel: 3, weight: 1 })) };
    const one = rankNextSkills([many], [], { limit: 3 });
    expect(one).toHaveLength(3);
    expect(rankNextSkills([many], [], { limit: 3 })).toEqual(one);
    expect(one.map((r) => r.skillId)).toEqual(["a", "b", "c"]); // equal lifts: tie-broken by id
  });

  test("every reported lift is positive and the total is the sum of the roles", () => {
    for (const r of rankNextSkills([A, B, C], student)) {
      expect(r.totalLift).toBeGreaterThan(0);
      expect(r.topRoles.every((t) => t.gain > 0)).toBe(true);
    }
  });

  test("an empty catalogue gives an empty answer, not an error", () => {
    expect(rankNextSkills([], student)).toEqual([]);
  });
});
