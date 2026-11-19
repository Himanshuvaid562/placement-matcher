const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const routes = require("./routes");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// Behind a reverse proxy (Render, Railway, nginx) so rate limiting sees the real client IP
app.set("trust proxy", 1);

app.use(helmet());
const origins = (process.env.CORS_ORIGIN || "http://localhost:3000").split(",").map((s) => s.trim());
app.use(cors({ origin: origins }));
// Bulk import of official records (up to 5000 rows) is the only route that needs a large body.
// This parser must come first: body-parser skips a request that is already parsed.
app.use("/api/verification/records/import", express.json({ limit: "2mb" }));
app.use(express.json({ limit: "100kb" }));

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use("/api", routes);

app.use((req, res) => res.status(404).json({ error: { code: 404, message: "Route not found" } }));
app.use(errorHandler);

module.exports = app;
