const express = require("express");
const router = express.Router();

router.use("/auth", require("./auth.routes"));
router.use("/students", require("./students.routes"));
router.use("/skills", require("./skills.routes"));
router.use("/verification", require("./verification.routes"));
router.use("/credentials", require("./credentials.routes"));
router.use("/public", require("./public.routes"));
router.use("/companies", require("./companies.routes"));
router.use("/opportunities", require("./opportunities.routes"));
router.use("/assessments", require("./assessments.routes"));
router.use("/analytics", require("./analytics.routes"));

module.exports = router;
