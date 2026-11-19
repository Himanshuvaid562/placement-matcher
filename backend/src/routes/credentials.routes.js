const express = require("express");
const requireAuth = require("../middleware/auth");
const requireRole = require("../middleware/rbac");
const validate = require("../middleware/validate");
const { rejectSchema } = require("../validators/verification");
const { approveCredentialSchema } = require("../validators/credential");
const { listForOfficer, officerFile, approve, reject } = require("../controllers/credentialController");

// Faculty review of students' certificates. Officers only.
const router = express.Router();
router.use(requireAuth, requireRole("officer"));

router.get("/", listForOfficer);
router.get("/:id/file", officerFile);
router.post("/:id/approve", validate(approveCredentialSchema), approve);
router.post("/:id/reject", validate(rejectSchema), reject);

module.exports = router;
