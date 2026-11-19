const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Assessment", required: true, index: true },
    text: { type: String, required: true },
    options: { type: [String], required: true, validate: (v) => v.length >= 2 },
    correctOptionIndex: { type: Number, required: true }, // never serialized to students pre-submission
    marks: { type: Number, default: 1 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Question", questionSchema);
