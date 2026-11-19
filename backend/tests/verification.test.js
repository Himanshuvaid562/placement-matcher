const {
  academicView, changedTrackedFields, buildComparison, validateSubmission, resolveApproval, publicVerification,
} = require("../src/services/verificationService");
const { checkEligibility } = require("../src/services/eligibilityService");

const claimed = { registrationNumber: "12000001", department: "CSE", batchYear: 2026, cgpa: 9.1, backlogs: 0 };
const official = { department: "CSE", batchYear: 2026, cgpa: 7.4, backlogs: 1 };

describe("academicView", () => {
  test("uses the verified snapshot, not the student's later claim", () => {
    const profile = {
      cgpa: 9.9, department: "ECE", batchYear: 2030, backlogs: 0,
      verification: { status: "verified", verifiedSnapshot: { department: "CSE", batchYear: 2026, cgpa: 7.4, backlogs: 1 } },
    };
    expect(academicView(profile)).toEqual({ department: "CSE", batchYear: 2026, cgpa: 7.4, backlogs: 1, verified: true });
  });

  test.each(["unverified", "pending", "rejected"])("%s profiles are provisional (verified:false)", (status) => {
    const view = academicView({ ...claimed, verification: { status } });
    expect(view.verified).toBe(false);
    expect(view.cgpa).toBe(9.1);
  });

  test("a profile with no verification field at all is treated as unverified", () => {
    expect(academicView({ cgpa: 8 }).verified).toBe(false);
  });

  test("eligibility on a verified snapshot ignores an inflated claim", () => {
    const rule = { minCgpa: 8, eligibleDepartments: [], eligibleBatchYears: [], maxBacklogs: 0 };
    const profile = {
      ...claimed,
      verification: { status: "verified", verifiedSnapshot: { department: "CSE", batchYear: 2026, cgpa: 7.4, backlogs: 1 } },
    };
    const result = checkEligibility(rule, academicView(profile));
    expect(result.eligible).toBe(false);
  });
});

describe("eligibility department matching", () => {
  test("is case-insensitive", () => {
    const rule = { minCgpa: 0, eligibleDepartments: ["cse"], eligibleBatchYears: [], maxBacklogs: 5 };
    expect(checkEligibility(rule, { cgpa: 8, department: "CSE", batchYear: 2026, backlogs: 0 }).eligible).toBe(true);
  });
});

describe("changedTrackedFields", () => {
  const existing = { registrationNumber: "12000001", department: "CSE", batchYear: 2026, cgpa: 8.2, backlogs: 0 };

  test("detects a real change", () => {
    expect(changedTrackedFields(existing, { cgpa: 9 })).toEqual(["cgpa"]);
  });
  test("re-saving identical values is not a change (even as strings / different case)", () => {
    expect(changedTrackedFields(existing, { cgpa: 8.2, department: "cse", batchYear: "2026", registrationNumber: "12000001" })).toEqual([]);
  });
  test("ignores fields that were not sent", () => {
    expect(changedTrackedFields(existing, { projects: [] })).toEqual([]);
  });
  test("filling a blank field counts as a change", () => {
    expect(changedTrackedFields({}, { cgpa: 8 })).toEqual(["cgpa"]);
  });
});

describe("buildComparison", () => {
  test("is null without an official record", () => {
    expect(buildComparison(claimed, null)).toBeNull();
  });
  test("flags exactly the mismatching fields", () => {
    const cmp = buildComparison(claimed, official);
    expect(cmp.filter((c) => !c.match).map((c) => c.field).sort()).toEqual(["backlogs", "cgpa"]);
    expect(cmp.find((c) => c.field === "cgpa")).toEqual({ field: "cgpa", claimed: 9.1, official: 7.4, match: false });
  });
});

describe("validateSubmission", () => {
  test("accepts complete details", () => {
    expect(() => validateSubmission({ ...claimed, verification: { status: "unverified" } })).not.toThrow();
  });
  test("accepts a resubmission after rejection", () => {
    expect(() => validateSubmission({ ...claimed, verification: { status: "rejected" } })).not.toThrow();
  });
  test("lists missing fields", () => {
    try {
      validateSubmission({ department: "CSE", verification: { status: "unverified" } });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e.statusCode).toBe(422);
      expect(e.details.missing.sort()).toEqual(["batchYear", "cgpa", "registrationNumber"]);
    }
  });
  test.each(["pending", "verified"])("refuses when already %s", (status) => {
    expect(() => validateSubmission({ ...claimed, verification: { status } })).toThrow(/already/);
  });
});

describe("resolveApproval", () => {
  test("official record wins over the student's claim", () => {
    const r = resolveApproval(claimed, official);
    expect(r.method).toBe("official_record");
    expect(r.snapshot).toEqual({ department: "CSE", batchYear: 2026, cgpa: 7.4, backlogs: 1 });
  });
  test("without an official record, a manual check must be explicitly confirmed", () => {
    expect(() => resolveApproval(claimed, null)).toThrow(/manualCheck/);
    expect(() => resolveApproval(claimed, null, { manualCheck: false })).toThrow(/manualCheck/);
    const r = resolveApproval(claimed, null, { manualCheck: true });
    expect(r.method).toBe("manual");
    expect(r.snapshot.cgpa).toBe(9.1);
  });
  test("incomplete claims cannot be approved, even with an official record", () => {
    expect(() => resolveApproval({ department: "CSE" }, official)).toThrow(/completed all academic details/);
  });
});

describe("publicVerification", () => {
  test("never leaks the reviewer's identity or the snapshot internals", () => {
    const out = publicVerification({
      verification: { status: "verified", method: "manual", reviewedBy: "officer-id", verifiedSnapshot: { cgpa: 8 } },
    });
    expect(out).not.toHaveProperty("reviewedBy");
    expect(out).not.toHaveProperty("verifiedSnapshot");
    expect(out.status).toBe("verified");
  });
});
