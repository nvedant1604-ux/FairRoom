import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

export default async function globalTeardown() {
  const pidFile = path.resolve("test-results", "servers.json");
  try {
    const pids = JSON.parse(await fs.readFile(pidFile, "utf8")) as number[];
    for (const pid of pids) {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", timeout: 5_000 });
      else process.kill(-pid, "SIGTERM");
    }
  } catch { /* backend may already have stopped */ }
  await fs.rm(pidFile, { force: true });
}
