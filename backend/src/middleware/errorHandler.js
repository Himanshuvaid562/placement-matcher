const ApiError = require("../utils/ApiError");

// Centralized error shape: { error: { code, message, details? } }
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: { code: err.statusCode, message: err.message, details: err.details || undefined },
    });
  }

  // Errors raised by express.json(): malformed JSON -> 400, body too large -> 413
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: 400, message: "Malformed JSON body" } });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: { code: 413, message: "Request body too large" } });
  }

  if (err.name === "CastError") {
    return res.status(400).json({ error: { code: 400, message: `Invalid ${err.path || "id"}` } });
  }

  if (err.name === "ValidationError") {
    return res.status(422).json({ error: { code: 422, message: "Validation failed", details: err.errors } });
  }

  if (err.code === 11000) {
    return res.status(409).json({ error: { code: 409, message: "Duplicate value", details: err.keyValue } });
  }

  console.error(err);
  return res.status(500).json({ error: { code: 500, message: "Internal server error" } });
}

module.exports = errorHandler;
