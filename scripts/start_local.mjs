import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const runtimeDir = path.join(root, ".runtime");
const emptyEnv = path.join(runtimeDir, "local.env");

fs.mkdirSync(runtimeDir, { recursive: true });
fs.writeFileSync(emptyEnv, "");

const child = spawn(process.execPath, ["server.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    DOTENV_CONFIG_PATH: emptyEnv,
    REQUIRE_SUPABASE: "",
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: ""
  }
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
