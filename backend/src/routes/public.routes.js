const express = require("express");
const { publicLimiter } = require("../middleware/rateLimit");
const { publicVerify } = require("../controllers/resumeController");

// No login: a recruiter opens a student's verification link. Rate-limited, uniform errors.
const router = express.Router();
router.get("/verify/:token", publicLimiter, publicVerify);

module.exports = router;
