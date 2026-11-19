const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const StudentProfile = require("../models/StudentProfile");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

function signToken(user) {
  return jwt.sign({ id: user._id, tv: user.tokenVersion }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

const publicUser = (user) => ({
  id: user._id,
  loginId: user.loginId,
  role: user.role,
  mustChangePassword: Boolean(user.mustChangePassword),
});

function inviteCodeValid(provided) {
  const expected = process.env.OFFICER_INVITE_CODE;
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const register = asyncHandler(async (req, res) => {
  const { loginId, password, role, inviteCode } = req.body;

  // Faculty/officer accounts are never self-service: they need the server-side invite code.
  // If OFFICER_INVITE_CODE is not configured, officer registration is disabled entirely.
  if (role === "officer" && !inviteCodeValid(inviteCode)) {
    throw new ApiError(403, "A valid officer invite code is required");
  }

  const existing = await User.findOne({ loginId });
  if (existing) {
    throw new ApiError(
      409,
      "An account with this ID already exists. If you did not create it, contact the Placement Office."
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ loginId, passwordHash, role });

  // A student's registration number IS their login ID and cannot be edited afterwards.
  if (role === "student") {
    await StudentProfile.create({ userId: user._id, registrationNumber: loginId });
  }

  res.status(201).json({ user: publicUser(user) });
});

const login = asyncHandler(async (req, res) => {
  const { loginId, password } = req.body;
  const user = await User.findOne({ loginId });
  // Same message for unknown ID, wrong password and disabled account
  if (!user || !user.isActive) throw new ApiError(401, "Invalid ID or password");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new ApiError(401, "Invalid ID or password");

  res.json({ token: signToken(user), user: publicUser(user) });
});

const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select("loginId role mustChangePassword isActive");
  if (!user || !user.isActive) throw new ApiError(401, "Account not found or disabled");
  res.json({ user: publicUser(user) });
});

// Changes the password, signs out every other session, and returns a fresh token.
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user.id);
  if (!user || !user.isActive) throw new ApiError(401, "Account not found or disabled");

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new ApiError(401, "Current password is incorrect");

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.mustChangePassword = false;
  user.tokenVersion += 1;
  await user.save();

  res.json({ token: signToken(user), user: publicUser(user) });
});

module.exports = { register, login, me, changePassword };
