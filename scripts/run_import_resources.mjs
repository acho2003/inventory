import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const script = path.join(root, "scripts", "import_resources.py");

const candidates = [
  process.env.PYTHON,
  "C:\\Users\\a\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe",
  "python",
  "py"
].filter(Boolean);

let lastError = "";

for (const python of candidates) {
  const probe = spawnSync(python, ["-c", "import openpyxl"], {
    cwd: root,
    encoding: "utf8",
    shell: false
  });

  if (probe.status !== 0) {
    lastError = `${python}: ${(probe.stderr || probe.stdout || "openpyxl unavailable").trim()}`;
    continue;
  }

  const result = spawnSync(python, [script], {
    cwd: root,
    stdio: "inherit",
    shell: false
  });
  process.exit(result.status ?? 1);
}

console.error("Could not find a Python runtime with openpyxl installed.");
console.error(lastError);
console.error("Install it with: python -m pip install openpyxl");
process.exit(1);
