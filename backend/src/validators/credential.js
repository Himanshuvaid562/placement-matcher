const { z } = require("zod");

// Multipart forms send empty optional inputs as "": treat those as "not provided".
const blankToUndefined = (v) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const createCredentialSchema = z.object({
  type: z.enum(["certification", "mooc"]),
  title: z.string().trim().min(2, "Enter the certificate or course title").max(120),
  issuer: z.string().trim().min(2, "Enter the issuing organisation or platform").max(80),
  issueDate: z.preprocess(
    blankToUndefined,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional()
  ),
  credentialId: z.preprocess(blankToUndefined, z.string().trim().max(80).optional()),
  result: z.preprocess(blankToUndefined, z.string().trim().max(40).optional()),
  link: z.preprocess(blankToUndefined, z.string().trim().max(500).optional()),
  skillId: z.preprocess(blankToUndefined, z.string().regex(/^[a-f\d]{24}$/i, "Choose a skill from the list").optional()),
  skillLevel: z.preprocess(
    (v) => (blankToUndefined(v) === undefined ? undefined : Number(v)),
    z.number().int().min(1, "Level must be 1-5").max(5, "Level must be 1-5").optional()
  ),
}).superRefine((v, ctx) => {
  if (v.skillId && !v.skillLevel) ctx.addIssue({ code: "custom", path: ["skillLevel"], message: "Choose the level this certificate covers" });
  if (v.skillLevel && !v.skillId) ctx.addIssue({ code: "custom", path: ["skillId"], message: "Choose which skill this certificate is for" });
  if (!v.issueDate) return;
  const [y, m, day] = v.issueDate.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, day));
  // JavaScript silently rolls 30 February into March, so require the date to round-trip exactly.
  const isRealDate = d.getUTCFullYear() === y && d.getUTCMonth() === m - 1 && d.getUTCDate() === day;
  const tomorrow = Date.now() + 24 * 3600 * 1000;
  if (!isRealDate || y < 2000 || d.getTime() > tomorrow) {
    ctx.addIssue({ code: "custom", path: ["issueDate"], message: "Enter a real issue date (not in the future)" });
  }
});

// Faculty may award a different level than the student claimed (e.g. an intro course claimed as level 5).
const approveCredentialSchema = z.object({ awardedLevel: z.number().int().min(1).max(5).optional() });

module.exports = { createCredentialSchema, approveCredentialSchema };
