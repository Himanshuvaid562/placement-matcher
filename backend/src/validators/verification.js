const { z } = require("zod");

const recordSchema = z.object({
  registrationNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9\-\/]{4,20}$/, "invalid registration number"),
  department: z.string().trim().min(1).max(60),
  batchYear: z.number().int().min(2000).max(2100),
  cgpa: z.number().min(0).max(10),
  backlogs: z.number().int().min(0).max(50).default(0),
});

const importSchema = z.object({ records: z.array(recordSchema).min(1).max(5000) });
const rejectSchema = z.object({ reason: z.string().trim().min(5, "Give the student a reason (min 5 characters)").max(300) });
const approveSchema = z.object({ manualCheck: z.boolean().optional() });

module.exports = { importSchema, rejectSchema, approveSchema };
