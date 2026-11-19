const rateLimit = require("express-rate-limit");

// Tight limit on auth endpoints to slow down credential stuffing / brute force.
// Disabled under NODE_ENV=test so integration tests are not throttled.
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { error: { code: 429, message: "Too many attempts, please try again shortly" } },
});

// Uploads store bytes in the database, so cap how many one account can send per hour.
// Runs after authentication, so the key is always the user's id.
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? req.user.id : "anonymous"),
  skip: () => process.env.NODE_ENV === "test",
  message: { error: { code: 429, message: "Too many uploads, please try again later" } },
});

// The public verification page needs no login, so cap lookups per IP (also slows token guessing).
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { error: { code: 429, message: "Too many requests, please try again shortly" } },
});

module.exports = { authLimiter, uploadLimiter, publicLimiter };
