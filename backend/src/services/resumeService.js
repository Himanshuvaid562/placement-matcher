/**
 * Resume logic (pure, no database): assemble the resume from verified data, check it against a role,
 * and build the privacy-limited view a recruiter sees through a share link.
 */
const crypto = require("crypto");
const { resolveLevel } = require("./matchingService");
const { academicView } = require("./verificationService");

const TIER_OF_SOURCE = { verified: "assessment", certificate: "certificate", self: "self" };
const TIER_ORDER = { assessment: 0, certificate: 1, self: 2 };

/** Evidence list -> named skills with the tier backing each, strongest first. */
function skillEntries(evidence, names) {
  const out = [];
  for (const e of evidence) {
    const { actual, source } = resolveLevel(e);
    const name = names.get(String(e.skillId));
    if (actual < 1 || !name) continue;
    out.push({ skillId: String(e.skillId), name, level: actual, evidence: TIER_OF_SOURCE[source] });
  }
  return out.sort((a, b) => TIER_ORDER[a.evidence] - TIER_ORDER[b.evidence] || b.level - a.level || a.name.localeCompare(b.name));
}

// The institution is fixed for this platform; only the degree and dates are typed by the student.
const INSTITUTION = { name: "Lovely Professional University", location: "Phagwara, Punjab" };

// Department codes as stored in the verified record -> the full name the format shows.
const DEPARTMENTS = {
  CSE: "Computer Science and Engineering", IT: "Information Technology",
  ECE: "Electronics and Communication Engineering", EEE: "Electrical and Electronics Engineering",
  EE: "Electrical Engineering", ME: "Mechanical Engineering", CE: "Civil Engineering", CIVIL: "Civil Engineering",
};
const departmentName = (code) => DEPARTMENTS[String(code ?? "").trim().toUpperCase()] || String(code ?? "").trim();

const plain = (x) => (x && typeof x.toObject === "function" ? x.toObject() : x);

/** Marker for a typed skill: only items backed by an assessment or a verified certificate get one. */
function evidenceForItem(item, skills) {
  let best = null;
  for (const s of skills) {
    if (s.evidence === "self" || !skillMentioned(item, s.name)) continue;
    if (best === null || TIER_ORDER[s.evidence] < TIER_ORDER[best]) best = s.evidence;
  }
  return best;
}

const bulletsOf = (p) => (p.bullets?.length ? [...p.bullets] : p.description ? [p.description] : []);

/**
 * Everything that goes on the resume, in the recommended format. Academic values come from the verified
 * record (department, CGPA); evidence markers come from assessments and faculty-verified certificates.
 */
function buildResumeData({ profile, resume, evidence, names, credentials }) {
  const view = academicView(profile);
  const skills = skillEntries(evidence, names);
  const contact = plain(resume?.contact) ?? {};
  const edu = plain(resume?.education) ?? {};

  return {
    name: resume?.fullName || "",
    contact: { email: contact.email, phone: contact.phone, linkedin: contact.linkedin, github: contact.github, portfolio: contact.portfolio },
    skillGroups: (resume?.skillGroups ?? [])
      .map((g) => ({
        label: g.label,
        items: [...(g.items || [])].map((name) => ({ name, evidence: evidenceForItem(name, skills) })),
      }))
      .filter((g) => g.items.length),
    skills, // everything the platform can evidence (used by the role check and the public page)
    projects: (resume?.projects ?? []).map((p) => ({
      title: p.title, link: p.link, date: p.date, bullets: bulletsOf(p), techStack: [...(p.techStack || [])],
    })),
    training: (resume?.training ?? []).map((t) => ({ title: t.title, link: t.link, date: t.date, description: t.description })),
    education: {
      institution: INSTITUTION.name,
      location: INSTITUTION.location,
      degree: edu.degree || "Bachelor of Technology",
      start: edu.start, end: edu.end,
      department: departmentName(view.department),
      departmentCode: view.department,
      batchYear: view.batchYear,
      cgpa: view.cgpa,
      registrationNumber: profile.registrationNumber,
      verified: view.verified,
      verifiedOn: view.verified ? profile.verification?.reviewedAt ?? null : null,
    },
    otherEducation: (resume?.otherEducation ?? []).map((e) => ({
      institution: e.institution, location: e.location, level: e.level, start: e.start, end: e.end, detail: e.detail,
    })),
    // Only faculty-verified certificates appear on a university-verified resume
    certificates: credentials
      .filter((c) => c.status === "verified")
      .map((c) => ({ title: c.title, issuer: c.issuer, issueDate: c.issueDate, credentialId: c.credentialId, result: c.result, link: c.link, type: c.type })),
  };
}

// ---------- resume check against a role ----------
const ALIASES = {
  javascript: ["js", "ecmascript"], typescript: ["ts"], "node.js": ["node", "nodejs"], react: ["react.js", "reactjs"],
  "express.js": ["expressjs"], mongodb: ["mongo"], postgresql: ["postgres", "psql"], "c++": ["cpp"],
  "data structures": ["dsa", "data structures and algorithms"], "machine learning": ["ml"],
  "artificial intelligence": ["ai"], kubernetes: ["k8s"], "system design": ["hld", "lld"],
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A skill name (or alias) as a whole word, tolerant of "Node.js" / "nodejs" / "node js". */
function patternFor(variant) {
  const parts = variant.split(/[\s.\-_]+/).filter(Boolean).map(escapeRegex);
  return new RegExp(`(?<![a-z0-9+#])${parts.join("[\\s.\\-_]?")}(?![a-z0-9+#])`, "i");
}

function skillMentioned(text, skillName) {
  const key = String(skillName).toLowerCase().trim();
  if (!key || !text) return false;
  return [key, ...(ALIASES[key] || [])].some((v) => patternFor(v).test(text));
}

// What a recruiter or ATS reads, split in two: the Skills section, and everything else.
const skillsText = (data) => data.skillGroups.flatMap((g) => g.items.map((i) => i.name)).join("\n");
function bodyText(data) {
  return [
    ...data.projects.flatMap((p) => [p.title, ...p.bullets, ...p.techStack]),
    ...data.training.flatMap((t) => [t.title, t.description]),
    ...data.certificates.flatMap((c) => [c.title, c.issuer]),
    ...data.otherEducation.map((e) => e.detail),
  ].filter(Boolean).join("\n");
}
const resumeText = (data) => `${skillsText(data)}\n${bodyText(data)}`;

const DISCLAIMER = "This checks whether your resume names the skills this role asks for. It is a keyword check, not a prediction of how any employer's screening will rank you.";

function resumeCheck(data, requiredSkills) {
  const platform = new Map(data.skills.map((s) => [s.skillId, s]));
  const inSkills = skillsText(data);
  const inBody = bodyText(data);
  const totalWeight = requiredSkills.reduce((s, r) => s + (r.weight ?? 1), 0) || 1;

  let covered = 0;
  const rows = requiredSkills.map((rs) => {
    const have = platform.get(String(rs.skillId));
    const status = skillMentioned(inSkills, rs.name) ? "listed" : skillMentioned(inBody, rs.name) ? "mentioned" : "absent";
    if (status !== "absent") covered += (rs.weight ?? 1) / totalWeight;

    let advice;
    if (status === "absent") advice = `${rs.name} does not appear anywhere. If you have used it, add it to a skill group and name a project where you used it. If not, see what-if for how much it would help.`;
    else if (status === "mentioned") advice = `${rs.name} appears in your projects or training but not in your Skills section. Add it to a skill group.`;
    else if (!have) advice = `${rs.name} is on your resume but not recorded on the platform. Add it to your profile skills, then back it with an assessment or a faculty-verified certificate.`;
    else if (have.level < rs.minLevel) advice = `${rs.name} is recorded at level ${have.level}; this role asks for ${rs.minLevel}.`;
    else if (have.evidence === "self") advice = `${rs.name} is listed but only self-reported. Back it with an assessment or a faculty-verified certificate.`;
    else advice = null;

    return {
      skillId: String(rs.skillId), name: rs.name, minLevel: rs.minLevel, status,
      level: have?.level ?? null, evidence: have?.evidence ?? null,
      meetsLevel: have ? have.level >= rs.minLevel : null, advice,
    };
  });

  return {
    coveragePct: Math.round(covered * 1000) / 10,
    counts: {
      listed: rows.filter((r) => r.status === "listed").length,
      mentionedOnly: rows.filter((r) => r.status === "mentioned").length,
      absent: rows.filter((r) => r.status === "absent").length,
    },
    rows,
    disclaimer: DISCLAIMER,
  };
}

// ---------- the view a recruiter gets from a share link ----------
const ISSUER = "Placement Office, via the LPU Placement Readiness platform";

/**
 * Only VERIFIED facts, and only what the student chose to reveal. No contact details, no unverified
 * academic figures, no self-reported skills. The name is the student's own entry (the platform keeps no
 * verified names), so it is flagged as such.
 */
function buildPublicView({ profile, resume, evidence, names, credentials, share, now = new Date() }) {
  const view = academicView(profile);
  const academic = view.verified
    ? {
        status: "verified",
        verifiedOn: profile.verification?.reviewedAt ?? null,
        department: view.department,
        batchYear: view.batchYear,
        backlogs: view.backlogs,
        ...(share.showCgpa ? { cgpa: view.cgpa } : {}),
        ...(share.showRegistrationNumber ? { registrationNumber: profile.registrationNumber } : {}),
      }
    : { status: "unverified", note: "The university has not verified this student's academic details." };

  return {
    issuer: ISSUER,
    asOf: now,
    validUntil: share.expiresAt,
    student: { name: resume?.fullName || "", nameIsSelfEntered: true },
    academic,
    skills: skillEntries(evidence, names).filter((s) => s.evidence !== "self"),
    certificates: credentials
      .filter((c) => c.status === "verified")
      .map((c) => ({ title: c.title, issuer: c.issuer, issueDate: c.issueDate, type: c.type, verifiedOn: c.reviewedAt })),
    notes: [
      "Skills shown are those backed by an assessment or a faculty-verified certificate; other skills on the resume are self-reported.",
      "The name is as entered by the student. Confirm identity with the student's ID card.",
      "This page reflects the university's records at the time you open it; it changes if verification is withdrawn.",
    ],
  };
}

// ---------- share tokens ----------
const newToken = () => crypto.randomBytes(32).toString("base64url"); // 43 chars, 256 bits
const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");
const isTokenShape = (t) => /^[A-Za-z0-9_-]{43}$/.test(String(t));
const isShareActive = (share, now = new Date()) => Boolean(share) && !share.revokedAt && new Date(share.expiresAt) > now;

module.exports = {
  skillEntries, buildResumeData, skillMentioned, resumeText, resumeCheck, buildPublicView,
  newToken, hashToken, isTokenShape, isShareActive, ALIASES, DISCLAIMER,
  INSTITUTION, departmentName, evidenceForItem, bulletsOf,
};
