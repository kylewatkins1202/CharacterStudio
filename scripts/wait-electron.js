const waitOn = require("wait-on");
const { spawn } = require("child_process");
const path = require("path");

const electronBin = path.join(__dirname, "..", "node_modules", ".bin", "electron");

waitOn({ resources: ["http://localhost:5173"], timeout: 30000 })
  .then(() => {
    const proc = spawn(
      electronBin,
      ["."],
      {
        stdio: "inherit",
        shell: false,
        env: { ...process.env, NODE_ENV: "development" }
      }
    );
    proc.on("close", (code) => process.exit(code));
  })
  .catch((err) => {
    console.error("wait-on failed:", err);
    process.exit(1);
  });