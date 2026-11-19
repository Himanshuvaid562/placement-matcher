/**
 * Pure, framework-free eligibility logic — easy to unit test in isolation.
 * Returns each rule check independently; never blends this with skill scoring.
 */
function checkEligibility(rule, profile) {
  const checks = [];

  checks.push({
    rule: "minCgpa",
    required: rule.minCgpa,
    actual: profile.cgpa,
    passed: typeof profile.cgpa === "number" && profile.cgpa >= rule.minCgpa,
  });

  if (rule.eligibleDepartments?.length) {
    checks.push({
      rule: "eligibleDepartments",
      required: rule.eligibleDepartments,
      actual: profile.department,
      passed: rule.eligibleDepartments.some(
        (d) => String(d).trim().toUpperCase() === String(profile.department ?? "").trim().toUpperCase()
      ),
    });
  }

  if (rule.eligibleBatchYears?.length) {
    checks.push({
      rule: "eligibleBatchYears",
      required: rule.eligibleBatchYears,
      actual: profile.batchYear,
      passed: rule.eligibleBatchYears.includes(profile.batchYear),
    });
  }

  checks.push({
    rule: "maxBacklogs",
    required: rule.maxBacklogs,
    actual: profile.backlogs ?? 0,
    passed: (profile.backlogs ?? 0) <= rule.maxBacklogs,
  });

  const eligible = checks.every((c) => c.passed);
  return { eligible, checks };
}

module.exports = { checkEligibility };
