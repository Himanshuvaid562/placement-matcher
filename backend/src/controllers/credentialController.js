const Credential = require("../models/Credential");
const CredentialFile = require("../models/CredentialFile");
const StudentProfile = require("../models/StudentProfile");
const Skill = require("../models/Skill");
const { certificateCap } = require("../services/evidenceService");
const {
  MAX_CREDENTIALS_PER_STUDENT, classifyLink, assertPdf, safePdfName, sha256, publicCredential,
} = require("../services/credentialService");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

// Streams the PDF so a browser tab can show it. Used by both the student (own files) and officers (any).
async function sendPdf(res, credential) {
  const file = credential.file?.sha256 ? await CredentialFile.findOne({ credentialId: credential._id }) : null;
  if (!file) throw new ApiError(404, "This certificate has no uploaded PDF");
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${safePdfName(credential.file.name)}"`,
    "Content-Length": String(file.data.length),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.send(file.data);
}

// ---------------- student ----------------
const listMine = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ userId: req.user.id });
  if (!profile) throw new ApiError(404, "Student profile not found");
  const items = await Credential.find({ studentId: profile._id }).populate("skillId", "name").sort({ createdAt: -1 });
  res.json({ data: items.map(publicCredential), limit: MAX_CREDENTIALS_PER_STUDENT, levelCap: certificateCap() });
});

const createMine = asyncHandler(async (req, res) => {
  const { type, title, issuer, issueDate, credentialId, result, link, skillId, skillLevel } = req.body;
  const file = req.file;

  // Cheap checks first (no database): proof present, link safe, file really a PDF.
  if (!file && !link) throw new ApiError(422, "Add a PDF or a link as proof of your certificate");
  const linkInfo = link ? classifyLink(link) : null;
  if (file) assertPdf(file.buffer);

  const profile = await StudentProfile.findOne({ userId: req.user.id });
  if (!profile) throw new ApiError(404, "Student profile not found");

  if (skillId && !(await Skill.exists({ _id: skillId }))) throw new ApiError(422, "That skill is not in the catalog");

  const count = await Credential.countDocuments({ studentId: profile._id });
  if (count >= MAX_CREDENTIALS_PER_STUDENT) {
    throw new ApiError(409, `You can add at most ${MAX_CREDENTIALS_PER_STUDENT} certificates. Delete one to add another.`);
  }

  const hash = file ? sha256(file.buffer) : undefined;
  if (hash && (await Credential.exists({ studentId: profile._id, "file.sha256": hash }))) {
    throw new ApiError(409, "You have already uploaded this exact file");
  }

  const credential = await Credential.create({
    studentId: profile._id,
    type, title, issuer,
    issueDate: issueDate ? new Date(`${issueDate}T00:00:00Z`) : undefined,
    credentialId,
    result,
    skillId: skillId || undefined,
    skillLevel: skillId ? skillLevel : undefined,
    link: linkInfo?.url,
    linkHost: linkInfo?.host,
    linkKnown: linkInfo?.known,
    file: file ? { name: file.originalname, size: file.size, sha256: hash } : undefined,
  });

  if (file) {
    try {
      await CredentialFile.create({ credentialId: credential._id, data: file.buffer });
    } catch (err) {
      await Credential.deleteOne({ _id: credential._id }); // never leave a record that claims a file it lacks
      throw err;
    }
  }

  res.status(201).json({ credential: publicCredential(credential) });
});

const deleteMine = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ userId: req.user.id });
  if (!profile) throw new ApiError(404, "Student profile not found");
  const removed = await Credential.findOneAndDelete({ _id: req.params.id, studentId: profile._id });
  if (!removed) throw new ApiError(404, "Certificate not found");
  await CredentialFile.deleteOne({ credentialId: removed._id });
  res.json({ deleted: true });
});

const myFile = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ userId: req.user.id });
  if (!profile) throw new ApiError(404, "Student profile not found");
  // Ownership is part of the query: another student's id simply "does not exist" for you.
  const credential = await Credential.findOne({ _id: req.params.id, studentId: profile._id });
  if (!credential) throw new ApiError(404, "Certificate not found");
  await sendPdf(res, credential);
});

// ---------------- officer ----------------
const listForOfficer = asyncHandler(async (req, res) => {
  const wanted = req.query.status;
  const status = ["pending", "verified", "rejected"].includes(wanted) ? wanted : wanted === "all" ? null : "pending";
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);

  const filter = {};
  if (status) filter.status = status;
  if (req.query.profileId) filter.studentId = req.query.profileId;

  const [items, total] = await Promise.all([
    Credential.find(filter)
      .populate("studentId", "registrationNumber department batchYear")
      .populate("skillId", "name")
      .sort(status === "pending" ? { createdAt: 1 } : { createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Credential.countDocuments(filter),
  ]);

  // Integrity signal: the same PDF uploaded by other students is a strong hint of sharing/forgery.
  const hashes = [...new Set(items.map((c) => c.file?.sha256).filter(Boolean))];
  const sameFile = hashes.length
    ? await Credential.find({ "file.sha256": { $in: hashes } }).select("file.sha256 studentId")
    : [];
  const studentsByHash = new Map();
  for (const c of sameFile) {
    const set = studentsByHash.get(c.file.sha256) || new Set();
    set.add(String(c.studentId));
    studentsByHash.set(c.file.sha256, set);
  }

  const data = items.map((c) => {
    const ownerId = String(c.studentId?._id ?? c.studentId);
    const shared = c.file?.sha256 ? [...(studentsByHash.get(c.file.sha256) || [])].filter((id) => id !== ownerId).length : 0;
    return {
      ...publicCredential(c),
      profileId: c.studentId?._id,
      registrationNumber: c.studentId?.registrationNumber,
      department: c.studentId?.department,
      batchYear: c.studentId?.batchYear,
      sharedFileWithOtherStudents: shared,
    };
  });

  res.json({ data, page, limit, total, levelCap: certificateCap() });
});

const officerFile = asyncHandler(async (req, res) => {
  const credential = await Credential.findById(req.params.id);
  if (!credential) throw new ApiError(404, "Certificate not found");
  await sendPdf(res, credential);
});

const approve = asyncHandler(async (req, res) => {
  const credential = await Credential.findById(req.params.id);
  if (!credential) throw new ApiError(404, "Certificate not found");
  if (credential.status === "verified") throw new ApiError(409, "Already verified");

  const { awardedLevel } = req.body;
  if (awardedLevel !== undefined && !credential.skillId) {
    throw new ApiError(422, "This certificate is not linked to a skill, so there is no level to award");
  }

  credential.status = "verified";
  credential.reviewedAt = new Date();
  credential.reviewedBy = req.user.id;
  credential.rejectionReason = undefined;
  // Faculty decide the level; default to what the student claimed. The matcher later caps it.
  credential.awardedLevel = credential.skillId ? (awardedLevel ?? credential.skillLevel) : undefined;
  await credential.save();
  res.json({ credential: publicCredential(credential) });
});

const reject = asyncHandler(async (req, res) => {
  const credential = await Credential.findById(req.params.id);
  if (!credential) throw new ApiError(404, "Certificate not found");
  if (credential.status === "rejected") throw new ApiError(409, "Already rejected");

  credential.status = "rejected";
  credential.awardedLevel = undefined; // a rejected certificate backs nothing
  credential.reviewedAt = new Date();
  credential.reviewedBy = req.user.id;
  credential.rejectionReason = req.body.reason;
  await credential.save();
  res.json({ credential: publicCredential(credential) });
});

module.exports = { listMine, createMine, deleteMine, myFile, listForOfficer, officerFile, approve, reject };
