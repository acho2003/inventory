import { execFileSync } from "node:child_process";

const port = process.env.PORT || "3000";

if (process.platform !== "win32") {
  console.error("stop:server is currently implemented for Windows PowerShell environments.");
  process.exit(1);
}

const command = [
  "$connections = Get-NetTCPConnection -LocalPort $env:PORT -State Listen -ErrorAction SilentlyContinue;",
  "if (-not $connections) { Write-Output \"No server is listening on port $env:PORT\"; exit 0 }",
  "$connections | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {",
  "  Stop-Process -Id $_ -Force;",
  "  Write-Output \"Stopped process $_ on port $env:PORT\"",
  "}"
].join(" ");

execFileSync("powershell.exe", ["-NoProfile", "-Command", command], {
  stdio: "inherit",
  env: { ...process.env, PORT: port }
});
