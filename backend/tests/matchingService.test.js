const { computeMatch } = require("../src/services/matchingService");
const { checkEligibility } = require("../src/services/eligibilityService");

describe("computeMatch", () => {
  const requiredSkills = [
    { skillId: "node", minLevel: 4, weight: 0.5 },
    { skillId: "mongo", minLevel: 3, weight: 0.5 },
  ];

  test("caps ratio at 1.0 even if actual exceeds required", () => {
    const studentSkills = [
      { skillId: "node", verifiedLevel: 5, selfReportedLevel: null },
      { skillId: "mongo", verifiedLevel: 3, selfReportedLevel: null },
    ];
    const { matchScore } = computeMatch(requiredSkills, studentSkills);
    expect(matchScore).toBe(100);
  });

  test("missing skill contributes zero, not negative or null", () => {
    const studentSkills = [{ skillId: "node", verifiedLevel: 4, selfReportedLevel: null }];
    const { matchScore, breakdown } = computeMatch(requiredSkills, studentSkills);
    expect(matchScore).toBe(50);
    expect(breakdown.find((b) => b.skillId === "mongo").source).toBe("missing");
  });

  test("verified level takes priority over self-reported", () => {
    const studentSkills = [
      { skillId: "node", verifiedLevel: 2, selfReportedLevel: 5 },
      { skillId: "mongo", verifiedLevel: null, selfReportedLevel: 3 },
    ];
    const { breakdown } = computeMatch(requiredSkills, studentSkills);
    expect(breakdown.find((b) => b.skillId === "node").source).toBe("verified");
    expect(breakdown.find((b) => b.skillId === "node").actual).toBe(2);
  });
});

describe("checkEligibility", () => {
  const rule = { minCgpa: 7, eligibleDepartments: ["CSE"], eligibleBatchYears: [2026], maxBacklogs: 0 };

  test("passes when all conditions met", () => {
    const profile = { cgpa: 8, department: "CSE", batchYear: 2026, backlogs: 0 };
    expect(checkEligibility(rule, profile).eligible).toBe(true);
  });

  test("fails and reports which check failed", () => {
    const profile = { cgpa: 6, department: "CSE", batchYear: 2026, backlogs: 0 };
    const result = checkEligibility(rule, profile);
    expect(result.eligible).toBe(false);
    expect(result.checks.find((c) => c.rule === "minCgpa").passed).toBe(false);
  });
});
