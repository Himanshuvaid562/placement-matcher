require("dotenv").config();

// Fail fast on missing/weak configuration instead of running insecurely
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error("[config] JWT_SECRET must be set and at least 32 characters long");
  process.exit(1);
}
if (!process.env.MONGO_URI) {
  console.error("[config] MONGO_URI must be set");
  process.exit(1);
}

const app = require("./app");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 5000;

connectDB(process.env.MONGO_URI)
  .then(async () => {
    // Older databases have a unique index on User.email; it would block every new login-ID user.
    // syncIndexes() makes the collection's indexes match the schema (drops the stale one).
    await require("./models/User").syncIndexes();
    app.listen(PORT, () => console.log(`[server] listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error("[db] connection failed", err);
    process.exit(1);
  });
