import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
const dir = mkdtempSync(join(tmpdir(), "migraine-browser-"));
const child = spawn(process.execPath, ["dist/server/index.js"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "test",
    DATA_DIR: dir,
    PORT: "3100",
    APP_ORIGIN: "http://localhost:3100",
    COOKIE_SECURE: "false",
    SETUP_SECRET: "browser-test-setup-secret-32-characters",
    LOG_LEVEL: "warn",
  },
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  rmSync(dir, { recursive: true, force: true });
  process.exit(code || 0);
});
