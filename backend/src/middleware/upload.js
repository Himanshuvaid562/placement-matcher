const multer = require("multer");
const ApiError = require("../utils/ApiError");
const { MAX_PDF_BYTES } = require("../services/credentialService");

const upload = multer({
  storage: multer.memoryStorage(), // bounded by fileSize below; bytes go straight to MongoDB
  limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 12, fieldSize: 4096, parts: 15 },
  fileFilter: (req, file, cb) =>
    file.mimetype === "application/pdf" ? cb(null, true) : cb(new ApiError(422, "Only PDF files are accepted")),
});

// Wraps multer so its errors become the API's normal error responses.
function singlePdf(fieldName) {
  const middleware = upload.single(fieldName);
  return (req, res, next) =>
    middleware(req, res, (err) => {
      if (!err) return next();
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(new ApiError(413, `File is too large (maximum ${MAX_PDF_BYTES / 1024 / 1024} MB)`));
      }
      if (err.name === "MulterError") return next(new ApiError(400, "Upload failed: send one PDF in the 'certificate' field"));
      next(err);
    });
}

module.exports = { singlePdf };
