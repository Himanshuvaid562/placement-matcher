const jwt = require("jsonwebtoken");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");

// While a forced password change is pending, these are the only endpoints the user may call.
const ALLOWED_WHILE_PASSWORD_CHANGE_PENDING = new Set(["/api/auth/me", "/api/auth/change-password"]);

/**
 * Verifies the JWT, then loads the user so that:
 *  - the role always comes from the database (a stale or forged role claim is never trusted)
 *  - disabled accounts and tokens issued before a password change/reset are rejected immediately
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new ApiError(401, "Missing or malformed Authorization header");

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    } catch (err) {
      throw new ApiError(401, "Invalid or expired token");
    }

    const user = await User.findById(payload.id).select("loginId role isActive tokenVersion mustChangePassword");
    if (!user || !user.isActive || user.tokenVersion !== payload.tv) {
      throw new ApiError(401, "Session is no longer valid, please log in again");
    }

    req.user = { id: String(user._id), role: user.role, loginId: user.loginId };

    if (user.mustChangePassword && !ALLOWED_WHILE_PASSWORD_CHANGE_PENDING.has(req.baseUrl + req.path)) {
      throw new ApiError(403, "Password change required");
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireAuth;
