const path = require("path");
const envPath = process.env.NODE_ENV === "production"
  ? path.join(process.resourcesPath, ".env")
  : path.join(__dirname, ".env");

require("dotenv").config({ path: envPath });
const express = require("express");
const cors = require("cors");
const db = require("./server/db");

const app = express();
const PORT = Number(process.env.PORT || 4989);
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || "100mb";

app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:3000", `http://localhost:${PORT}`],
  credentials: true
}));
app.use(express.json({ limit: JSON_BODY_LIMIT }));

// ─── Mount & start ─────────────────────────────────────────────────────────────

app.use("/api", require("./server/routes"));

db.setupDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n  🎨  Seedream Studio`);
      console.log(`  ➜  API:    http://localhost:${PORT}/api`);
      console.log(`  ➜  Client: http://localhost:5173  (dev)\n`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize:", error);
    process.exit(1);
  });
