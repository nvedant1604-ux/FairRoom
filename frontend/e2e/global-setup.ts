import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";

function urlIsReady(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = http.get(url, { agent: false }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1_000, () => { request.destroy(); resolve(false); });
  });
}

export default async function globalSetup() {
  if (await urlIsReady("http://127.0.0.1:8010/api/health") || await urlIsReady("http://127.0.0.1:5174")) {
    throw new Error("E2E ports 8010 or 5174 are already in use. Stop the previous test servers before starting a new isolated run.");
  }
  const resultsDir = path.resolve("test-results");
  const database = path.join(resultsDir, "ai-lottery-e2e.sqlite");
  const pidFile = path.join(resultsDir, "servers.json");
  await fs.mkdir(resultsDir, { recursive: true });
  await fs.rm(database, { force: true });
  await fs.rm(`${database}-shm`, { force: true });
  await fs.rm(`${database}-wal`, { force: true });
  const backendLog = fsSync.openSync(path.join(resultsDir, "backend.log"), "w");
  const frontendLog = fsSync.openSync(path.join(resultsDir, "frontend.log"), "w");

  const backend = spawn("python", ["-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", "8010"], {
    cwd: path.resolve(".."), detached: true, env: { ...process.env, AI_LOTTERY_DB: database }, stdio: ["ignore", backendLog, backendLog]
  });
  backend.unref();
  const frontend = spawn(process.execPath, [path.resolve("node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "5174", "--strictPort"], {
    cwd: path.resolve("."),
    detached: true,
    env: {
      ...process.env,
      VITE_API_BASE_URL: "http://127.0.0.1:8010/api",
      VITE_GOOGLE_MAPS_ENABLED: "true",
      VITE_GOOGLE_MAPS_TEST_MODE: "true",
      VITE_GOOGLE_MAPS_API_KEY: ""
    },
    stdio: ["ignore", frontendLog, frontendLog]
  });
  frontend.unref();
  await fs.writeFile(pidFile, JSON.stringify([backend.pid, frontend.pid]));

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await urlIsReady("http://127.0.0.1:8010/api/health") && await urlIsReady("http://127.0.0.1:5174")) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The isolated E2E servers did not start within 15 seconds.");
}
