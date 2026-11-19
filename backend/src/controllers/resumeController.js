const QRCode = require("qrcode");
const Resume = require("../models/Resume");
const ResumeShare = require("../models/ResumeShare");
const StudentProfile = require("../models/StudentProfile");
const StudentSkill = require("../models/StudentSkill");
const Credential = require("../models/Credential");
const Skill = require("../models/Skill");
const PlacementOpportunity = require("../models/PlacementOpportunity");
const { certificateLevels, mergeEvidence } = require("../services/evidenceService");
const { classifyLink, safePdfName } = require("../services/credentialService");
const {
  buildResumeData, resumeCheck, buildPublicView, newToken, hashToken, isTokenShape, isShareActive, bulletsOf,
} = require("../services/resumeService");
const { renderResumePdf } = require("../services/pdfService");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

const MAX_ACTIVE_SHARES = 10;

const appUrl = () =>
  (process.env.PUBLIC_APP_URL || (process.env.CORS_ORIGIN || "http://localhost:3000").split(",")[0]).trim().replace(/\/$/, "");

async function getProfile(userId) {
  const profile = await StudentProfile.findOne({ userId });
  if (!profile) throw new ApiError(404, "Student profile not found");
  return profile;
}

// Everything needed to render a resume or a verification page for one student
async function loadResumeContext(studentId) {
  const [resume, skills, credentials] = await Promise.all([
    Resume.findOne({ studentId }),
    StudentSkill.find({ studentId }),
    Credential.find({ studentId, status: "verified" }).sort({ issueDate: -1 }),
  ]);
  const evidence = mergeEvidence(skills, certificateLevels(credentials));
  const ids = evidence.map((e) => String(e.skillId));
  const found = ids.length ? await Skill.find({ _id: { $in: ids } }) : [];
  const names = new Map(found.map((s) => [String(s._id), s.name]));
  return { resume, evidence, credentials, names };
}

const EMPTY_EDITABLE = { fullName: "", contact: {}, skillGroups: [], projects: [], training: [], education: {}, otherEducation: [] };
const plain = (x) => (x && typeof x.toObject === "function" ? x.toObject() : x);
const toEditable = (r) =>
  r
    ? {
        fullName: r.fullName,
        contact: plain(r.contact) ?? {},
        skillGroups: (r.skillGroups || []).map((g) => ({ label: g.label, items: [...(g.items || [])] })),
        projects: (r.projects || []).map((p) => ({
          title: p.title, link: p.link, date: p.date, bullets: bulletsOf(p), techStack: [...(p.techStack || [])],
        })),
        training: (r.training || []).map((t) => ({ title: t.title, link: t.link, date: t.date, description: t.description })),
        education: plain(r.education) ?? {},
        otherEducation: (r.otherEducation || []).map((e) => ({
          institution: e.institution, location: e.location, level: e.level, start: e.start, end: e.end, detail: e.detail,
        })),
      }
    : EMPTY_EDITABLE;

// Resume links are shown as text and followed by recruiters: apply the same screening as proof links.
function normaliseLinks(data) {
  const clean = (value, label) => {
    if (!value) return undefined;
    try {
      return classifyLink(value).url;
    } catch (err) {
      throw new ApiError(422, `${label}: ${err.message}`);
    }
  };
  for (const key of ["linkedin", "github", "portfolio"]) data.contact[key] = clean(data.contact[key], key[0].toUpperCase() + key.slice(1));
  data.projects.forEach((p, i) => { p.link = clean(p.link, `Project ${i + 1} link`); });
  data.training.forEach((t, i) => { t.link = clean(t.link, `Training ${i + 1} link`); });
  return data;
}

async function resumeResponse(profile) {
  const ctx = await loadResumeContext(profile._id);
  const pending = await Credential.countDocuments({ studentId: profile._id, status: "pending" });
  return {
    resume: toEditable(ctx.resume),
    saved: Boolean(ctx.resume),
    preview: buildResumeData({ profile, ...ctx }),
    pendingCertificates: pending, // not on the resume until faculty verify them
  };
}

const getResume = asyncHandler(async (req, res) => {
  res.json(await resumeResponse(await getProfile(req.user.id)));
});

const saveResume = asyncHandler(async (req, res) => {
  const profile = await getProfile(req.user.id);
  const data = normaliseLinks(req.body);
  await Resume.findOneAndUpdate(
    { studentId: profile._id },
    { $set: { ...data, studentId: profile._id } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  res.json(await resumeResponse(profile));
});

const checkResume = asyncHandler(async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.opportunityId)) throw new ApiError(404, "Opportunity not found");
  const profile = await getProfile(req.user.id);
  const opportunity = await PlacementOpportunity.findOne({ _id: req.params.opportunityId, status: "published" });
  if (!opportunity) throw new ApiError(404, "Opportunity not found or not published");

  const ctx = await loadResumeContext(profile._id);
  if (!ctx.resume) throw new ApiError(409, "Save your resume first, then check it against a role");

  const reqIds = opportunity.requiredSkills.map((r) => String(r.skillId));
  const found = await Skill.find({ _id: { $in: reqIds } });
  const roleNames = new Map(found.map((s) => [String(s._id), s.name]));
  const required = opportunity.requiredSkills.map((r) => ({
    skillId: String(r.skillId), minLevel: r.minLevel, weight: r.weight, name: roleNames.get(String(r.skillId)) || "Unknown skill",
  }));

  res.json(resumeCheck(buildResumeData({ profile, ...ctx }), required));
});

// ---------------- share links ----------------
const publicShare = (s, now = new Date()) => ({
  id: s._id, createdAt: s.createdAt, expiresAt: s.expiresAt, revokedAt: s.revokedAt,
  active: isShareActive(s, now), showCgpa: s.showCgpa, showRegistrationNumber: s.showRegistrationNumber,
  viewCount: s.viewCount, lastViewedAt: s.lastViewedAt,
});

const listShares = asyncHandler(async (req, res) => {
  const profile = await getProfile(req.user.id);
  const shares = await ResumeShare.find({ studentId: profile._id }).sort({ createdAt: -1 }).limit(50);
  res.json({ data: shares.map((s) => publicShare(s)), maxActive: MAX_ACTIVE_SHARES });
});

const createShare = asyncHandler(async (req, res) => {
  const profile = await getProfile(req.user.id);
  const resume = await Resume.findOne({ studentId: profile._id });
  if (!resume) throw new ApiError(409, "Save your resume (with your name) before creating a verification link");

  const active = await ResumeShare.countDocuments({ studentId: profile._id, revokedAt: null, expiresAt: { $gt: new Date() } });
  if (active >= MAX_ACTIVE_SHARES) throw new ApiError(409, `You can have at most ${MAX_ACTIVE_SHARES} active links. Revoke one first.`);

  const { expiresInDays, showCgpa, showRegistrationNumber } = req.body;
  const token = newToken();
  const share = await ResumeShare.create({
    studentId: profile._id,
    tokenHash: hashToken(token),
    showCgpa, showRegistrationNumber,
    expiresAt: new Date(Date.now() + expiresInDays * 24 * 3600 * 1000),
  });

  // The token exists only in this response: we store its hash, so it cannot be shown again.
  res.set("Cache-Control", "no-store");
  res.status(201).json({ share: publicShare(share), token, url: `${appUrl()}/verify/${token}` });
});

const revokeShare = asyncHandler(async (req, res) => {
  const profile = await getProfile(req.user.id);
  const share = await ResumeShare.findOne({ _id: req.params.id, studentId: profile._id });
  if (!share) throw new ApiError(404, "Link not found");
  if (!share.revokedAt) {
    share.revokedAt = new Date();
    await share.save();
  }
  res.json({ share: publicShare(share) });
});

// ---------------- PDF ----------------
const downloadPdf = asyncHandler(async (req, res) => {
  const profile = await getProfile(req.user.id);
  const ctx = await loadResumeContext(profile._id);
  if (!ctx.resume) throw new ApiError(409, "Save your resume (with your name) first");

  let verifyUrl;
  let qrPng;
  if (req.body.shareToken) {
    const share = await ResumeShare.findOne({ studentId: profile._id, tokenHash: hashToken(req.body.shareToken) });
    if (!isShareActive(share)) throw new ApiError(422, "That verification link is no longer active. Create a new one.");
    verifyUrl = `${appUrl()}/verify/${req.body.shareToken}`;
    qrPng = await QRCode.toBuffer(verifyUrl, { type: "png", margin: 1, width: 240, errorCorrectionLevel: "M" });
  }

  const pdf = await renderResumePdf(buildResumeData({ profile, ...ctx }), { verifyUrl, qrPng, verificationMarks: req.body.verificationMarks });
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${safePdfName(`${ctx.resume.fullName}_resume`)}"`,
    "Content-Length": String(pdf.length),
    "Cache-Control": "private, no-store",
  });
  res.send(pdf);
});

// ---------------- public verification (no login) ----------------
const notFound = () => new ApiError(404, "This verification link is not valid. It may have expired or been withdrawn.");

const publicVerify = asyncHandler(async (req, res) => {
  const { token } = req.params;
  // One identical answer for malformed, unknown, expired and revoked tokens, so links cannot be probed.
  if (!isTokenShape(token)) throw notFound();
  const share = await ResumeShare.findOne({ tokenHash: hashToken(token) });
  if (!isShareActive(share)) throw notFound();

  const profile = await StudentProfile.findById(share.studentId);
  if (!profile) throw notFound();

  const ctx = await loadResumeContext(share.studentId);
  await ResumeShare.updateOne({ _id: share._id }, { $inc: { viewCount: 1 }, $set: { lastViewedAt: new Date() } });

  res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
  res.json(buildPublicView({ profile, share, ...ctx }));
});

module.exports = {
  getResume, saveResume, checkResume, listShares, createShare, revokeShare, downloadPdf, publicVerify,
};
