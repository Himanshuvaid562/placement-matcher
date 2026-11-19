const { z } = require("zod");

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

const whatIfSchema = z.object({
  opportunityId: objectId,
  // empty is allowed: it just returns the baseline so the page can draw its sliders
  changes: z.array(z.object({ skillId: objectId, level: z.number().int().min(1).max(5) })).max(10).default([]),
});

module.exports = { whatIfSchema };
