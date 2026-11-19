const mongoose = require("mongoose");

const attemptSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentProfile", required: true, index: true },
    assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Assessment", required: true, index: true },
    startedAt: { type: Date, required: true },
    submittedAt: Date,
    expiresAt: { type: Date, required: true },
    answers: [
      {
        questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question" },
        selectedOptionIndex: Number,
      },
    ],
    score: Number,
    maxScore: Number,
    status: { type: String, enum: ["in_progress", "submitted", "expired"], default: "in_progress" },
  },
  { timestamps: true }
);

attemptSchema.index({ studentId: 1, assessmentId: 1, startedAt: -1 });

module.exports = mongoose.model("AssessmentAttempt", attemptSchema);
