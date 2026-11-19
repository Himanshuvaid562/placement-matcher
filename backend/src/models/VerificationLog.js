const mongoose = require("mongoose");

// Append-only audit trail of verification decisions (who approved/rejected what, and when).
const verificationLogSchema = new mongoose.Schema(
  {
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentProfile", index: true },
    action: {
      type: String,
      enum: ["submitted", "approved", "rejected", "revoked", "reset", "records_imported", "password_reset"],
      required: true,
    },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    details: mongoose.Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model("VerificationLog", verificationLogSchema);
