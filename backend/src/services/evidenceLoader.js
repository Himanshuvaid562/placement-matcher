const StudentSkill = require("../models/StudentSkill");
const Credential = require("../models/Credential");
const { certificateLevels, mergeEvidence } = require("./evidenceService");

const VERIFIED_SKILL_CERTS = { status: "verified", skillId: { $ne: null } };

const pushTo = (map, key, value) => {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
};

// All evidence for one student, ready for computeMatch
async function loadEvidence(studentId) {
  const [skills, creds] = await Promise.all([
    StudentSkill.find({ studentId }),
    Credential.find({ studentId, ...VERIFIED_SKILL_CERTS }).select("status skillId awardedLevel"),
  ]);
  return mergeEvidence(skills, certificateLevels(creds));
}

// Same for many students in two queries (used by officer analytics). Returns Map(studentId -> evidence[]).
async function loadEvidenceForMany(studentIds) {
  const [skills, creds] = await Promise.all([
    StudentSkill.find({ studentId: { $in: studentIds } }),
    Credential.find({ studentId: { $in: studentIds }, ...VERIFIED_SKILL_CERTS }).select("studentId status skillId awardedLevel"),
  ]);
  const skillsBy = new Map();
  const credsBy = new Map();
  for (const s of skills) pushTo(skillsBy, String(s.studentId), s);
  for (const c of creds) pushTo(credsBy, String(c.studentId), c);

  const out = new Map();
  for (const id of studentIds) {
    out.set(String(id), mergeEvidence(skillsBy.get(String(id)) || [], certificateLevels(credsBy.get(String(id)) || [])));
  }
  return out;
}

module.exports = { loadEvidence, loadEvidenceForMany };
