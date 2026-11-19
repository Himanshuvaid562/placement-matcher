/**
 * Deterministic, rule-based recommendations derived straight from the match breakdown:
 * no ML, fully explainable. The advice depends on what the current level is backed by.
 */
function actionFor(g) {
  const gap = g.required - g.actual;
  switch (g.source) {
    case "missing":
      return "No evidence yet. Take the assessment (strongest proof), add a certificate for it, or self-report a level to set a baseline.";
    case "verified":
      return `Assessment-verified level ${g.actual}; target ${g.required}. Practise and retake the assessment to close a ${gap}-level gap.`;
    case "certificate":
      return `Certificate-backed level ${g.actual}; target ${g.required}. Take the assessment or add a higher-level certificate to close a ${gap}-level gap.`;
    default:
      return `Self-reported level ${g.actual}; target ${g.required}. Close a ${gap}-level gap, then back it with an assessment or a faculty-verified certificate.`;
  }
}

function generateRecommendations(breakdown) {
  return breakdown
    .filter((b) => b.actual < b.required)
    .sort((a, b) => (b.required - b.actual) - (a.required - a.actual))
    .map((g) => ({
      skillId: g.skillId,
      gapSize: g.required - g.actual,
      suggestedAction: actionFor(g),
    }));
}

module.exports = { generateRecommendations };
