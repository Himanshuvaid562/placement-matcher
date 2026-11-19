const Assessment = require("../models/Assessment");
const Question = require("../models/Question");
const AssessmentAttempt = require("../models/AssessmentAttempt");
const StudentProfile = require("../models/StudentProfile");
const StudentSkill = require("../models/StudentSkill");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

const listAssessments = asyncHandler(async (req, res) => {
  const filter = req.user.role === "student" ? { isPublished: true } : {};
  const assessments = await Assessment.find(filter).sort({ createdAt: -1 });
  res.json({ data: assessments });
});

const createAssessment = asyncHandler(async (req, res) => {
  const { title, type, skillId, durationMinutes } = req.body;
  if (!title || !["technical", "aptitude"].includes(type)) {
    throw new ApiError(422, "title and a valid type (technical|aptitude) are required");
  }

  const assessment = await Assessment.create({
    title,
    type,
    skillId: skillId || null,
    durationMinutes: durationMinutes || 30,
    createdBy: req.user.id,
  });
  res.status(201).json({ assessment });
});

const addQuestion = asyncHandler(async (req, res) => {
  const { text, options, correctOptionIndex, marks } = req.body;
  if (!text || !Array.isArray(options) || options.length < 2 || correctOptionIndex == null) {
    throw new ApiError(422, "text, at least 2 options, and correctOptionIndex are required");
  }
  if (correctOptionIndex < 0 || correctOptionIndex >= options.length) {
    throw new ApiError(422, "correctOptionIndex must reference a valid option");
  }

  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) throw new ApiError(404, "Assessment not found");

  const question = await Question.create({
    assessmentId: assessment._id,
    text,
    options,
    correctOptionIndex,
    marks: marks || 1,
  });
  res.status(201).json({ question });
});

const listQuestionsForOfficer = asyncHandler(async (req, res) => {
  // Officers can see the correct answers when authoring; students never hit this route.
  const questions = await Question.find({ assessmentId: req.params.id });
  res.json({ data: questions });
});

const publishAssessment = asyncHandler(async (req, res) => {
  const questionCount = await Question.countDocuments({ assessmentId: req.params.id });
  if (questionCount === 0) throw new ApiError(422, "Add at least one question before publishing");

  const assessment = await Assessment.findByIdAndUpdate(
    req.params.id,
    { isPublished: true },
    { new: true }
  );
  if (!assessment) throw new ApiError(404, "Assessment not found");
  res.json({ assessment });
});

const startAttempt = asyncHandler(async (req, res) => {
  const assessment = await Assessment.findOne({ _id: req.params.id, isPublished: true });
  if (!assessment) throw new ApiError(404, "Assessment not found or not published");

  const profile = await StudentProfile.findOne({ userId: req.user.id });
  const questions = await Question.find({ assessmentId: assessment._id }).select("-correctOptionIndex");

  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + assessment.durationMinutes * 60 * 1000);

  const attempt = await AssessmentAttempt.create({
    studentId: profile._id,
    assessmentId: assessment._id,
    startedAt,
    expiresAt,
    maxScore: questions.reduce((sum, q) => sum + (q.marks || 1), 0),
    status: "in_progress",
  });

  res.status(201).json({ attemptId: attempt._id, expiresAt, questions });
});

const submitAttempt = asyncHandler(async (req, res) => {
  const { answers = [] } = req.body; // [{ questionId, selectedOptionIndex }]
  if (!Array.isArray(answers)) throw new ApiError(422, "answers must be an array");

  const profile = await StudentProfile.findOne({ userId: req.user.id });
  if (!profile) throw new ApiError(404, "Student profile not found");

  // Ownership check: a student may only submit their own attempt.
  // Return 404 (not 403) so attempt ids cannot be probed.
  const attempt = await AssessmentAttempt.findOne({ _id: req.params.id, studentId: profile._id });
  if (!attempt) throw new ApiError(404, "Attempt not found");
  if (attempt.status !== "in_progress") throw new ApiError(409, "Attempt already submitted or expired");

  const now = new Date();
  if (now > attempt.expiresAt) {
    attempt.status = "expired";
    await attempt.save();
    throw new ApiError(409, "Attempt window has expired");
  }

  // Only questions that belong to THIS assessment can score, and each question counts once.
  const questions = await Question.find({ assessmentId: attempt.assessmentId });
  const questionMap = new Map(questions.map((q) => [String(q._id), q]));

  const accepted = new Map(); // questionId -> selectedOptionIndex (last answer wins)
  for (const a of answers) {
    if (questionMap.has(String(a.questionId)) && Number.isInteger(a.selectedOptionIndex)) {
      accepted.set(String(a.questionId), a.selectedOptionIndex);
    }
  }

  let score = 0;
  for (const [qid, selected] of accepted) {
    const q = questionMap.get(qid);
    if (q.correctOptionIndex === selected) score += q.marks || 1;
  }

  attempt.answers = [...accepted].map(([questionId, selectedOptionIndex]) => ({ questionId, selectedOptionIndex }));
  attempt.score = score;
  attempt.submittedAt = now;
  attempt.status = "submitted";
  await attempt.save();

  // If this assessment maps to a single skill, the score sets the verified level for that skill.
  const assessment = await Assessment.findById(attempt.assessmentId);
  if (assessment?.skillId) {
    const pct = attempt.maxScore ? score / attempt.maxScore : 0;
    const verifiedLevel = Math.max(1, Math.min(5, Math.round(pct * 5)));
    await StudentSkill.findOneAndUpdate(
      { studentId: attempt.studentId, skillId: assessment.skillId },
      { $set: { verifiedLevel, verifiedBy: attempt._id } },
      { upsert: true }
    );
  }

  res.json({ score, maxScore: attempt.maxScore });
});

const myAttempts = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ userId: req.user.id });
  const attempts = await AssessmentAttempt.find({ studentId: profile._id })
    .populate("assessmentId", "title type")
    .sort({ startedAt: -1 });
  res.json({ data: attempts });
});

module.exports = {
  listAssessments,
  createAssessment,
  addQuestion,
  listQuestionsForOfficer,
  publishAssessment,
  startAttempt,
  submitAttempt,
  myAttempts,
};
