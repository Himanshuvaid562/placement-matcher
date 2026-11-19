const ApiError = require("../utils/ApiError");

// usage: requireRole("officer") or requireRole("student", "officer")
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, "Not authenticated"));
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, `Requires role: ${allowedRoles.join(" or ")}`));
    }
    next();
  };
}

module.exports = requireRole;
