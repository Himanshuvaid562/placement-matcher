const express = require("express");
const requireAuth = require("../middleware/auth");
const requireRole = require("../middleware/rbac");
const validate = require("../middleware/validate");
const { importSchema, rejectSchema, approveSchema } = require("../validators/verification");
const { importRecords, listQueue, approve, reject, history, resetStudentPassword } = require("../controllers/verificationController");

// Only Placement Officers act as the university's verifier.
const router = express.Router();
router.use(requireAuth, requireRole("officer"));

router.post("/records/import", validate(importSchema), importRecords);
router.get("/queue", listQueue);
router.post("/:profileId/approve", validate(approveSchema), approve);
router.post("/:profileId/reject", validate(rejectSchema), reject);
router.get("/:profileId/history", history);
router.post("/:profileId/reset-password", resetStudentPassword);

module.exports = router;
