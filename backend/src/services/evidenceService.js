/**
 * Evidence tiers for a skill level (pure, no database):
 *   assessment-verified  >  certificate-backed (capped)  >  self-reported
 * A certificate shows exposure to a topic, not mastery, so the level it can support is capped
 * (default 3 of 5, set CERTIFICATE_LEVEL_CAP to change). Only FACULTY-VERIFIED certificates count.
 */
const DEFAULT_CAP = 3;

function certificateCap(env = process.env) {
  const raw = String(env.CERTIFICATE_LEVEL_CAP ?? "").trim();
  return /^[1-5]$/.test(raw) ? Number(raw) : DEFAULT_CAP; // strict: "2.5x" must not quietly become 2
}

/** credentials -> Map(skillId -> highest capped level backed by a verified certificate) */
function certificateLevels(credentials, cap = certificateCap()) {
  const out = new Map();
  for (const c of credentials) {
    if (c.status !== "verified" || !c.skillId || !c.awardedLevel) continue;
    const level = Math.min(Number(c.awardedLevel), cap);
    if (!(level >= 1)) continue;
    const key = String(c.skillId?._id ?? c.skillId);
    out.set(key, Math.max(out.get(key) || 0, level));
  }
  return out;
}

/** Combine a student's recorded skills with certificate-backed levels into one list for the matcher. */
function mergeEvidence(studentSkills, certLevels) {
  const byId = new Map();
  for (const s of studentSkills) {
    byId.set(String(s.skillId), {
      skillId: s.skillId,
      selfReportedLevel: s.selfReportedLevel ?? null,
      verifiedLevel: s.verifiedLevel ?? null,
      certificateLevel: null,
    });
  }
  for (const [id, level] of certLevels) {
    const entry = byId.get(id) || { skillId: id, selfReportedLevel: null, verifiedLevel: null, certificateLevel: null };
    entry.certificateLevel = level;
    byId.set(id, entry);
  }
  return [...byId.values()];
}

module.exports = { DEFAULT_CAP, certificateCap, certificateLevels, mergeEvidence };
