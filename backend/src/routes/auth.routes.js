const express = require("express");
const { register, login, me, changePassword } = require("../controllers/authController");
const requireAuth = require("../middleware/auth");
const validate = require("../middleware/validate");
const { authLimiter } = require("../middleware/rateLimit");
const { registerSchema, loginSchema, changePasswordSchema } = require("../validators/auth");

const router = express.Router();
router.post("/register", authLimiter, validate(registerSchema), register);
router.post("/login", authLimiter, validate(loginSchema), login);
router.get("/me", requireAuth, me);
router.post("/change-password", authLimiter, requireAuth, validate(changePasswordSchema), changePassword);

module.exports = router;
