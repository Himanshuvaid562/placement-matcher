const mongoose = require("mongoose");

// loginId is the LPU registration number for students (8+ digits) or the employee ID for
// faculty/placement officers (5+ digits). Kept as a STRING so leading zeros survive.
const userSchema = new mongoose.Schema(
  {
    loginId: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["student", "officer"], required: true },
    isActive: { type: Boolean, default: true },
    // Set when an officer issues a temporary password: the user can do nothing but change it.
    mustChangePassword: { type: Boolean, default: false },
    // Embedded in every JWT. Bumping it signs the user out everywhere (password change/reset).
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
