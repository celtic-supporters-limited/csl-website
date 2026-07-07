import { defineConfig, devices } from "@playwright/test";
import fs from "fs";
import path from "path";

// Load .env.test.local if it exists — Playwright does not auto-load env files.
// PowerShell Out-File writes UTF-8 with BOM; strip the BOM before parsing.
const envFile = path.resolve(".env.test.local");
if (fs.existsSync(envFile)) {
  const raw = fs.readFileSync(envFile, "utf-8").replace(/^﻿/, "");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

const externalTarget = process.env.PLAYWRIGHT_BASE_URL &&
  !process.env.PLAYWRIGHT_BASE_URL.startsWith("http://localhost");

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001",
    // Capture screenshots and traces only on failure for easier debugging.
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Skip the local dev server when targeting an external URL (production, preview).
  // When PLAYWRIGHT_BASE_URL points to a deployed site, there is nothing to start locally.
  //
  // REQUIREMENT for local runs: .env.local must exist with real Supabase/Stripe keys.
  ...(!externalTarget && {
    webServer: {
      command: "npm run dev -- --port 3001",
      url: "http://localhost:3001",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  }),
});
