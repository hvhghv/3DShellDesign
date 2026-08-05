import { defineConfig } from "@playwright/test";

const runtime = globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};
const isCI = runtime.process?.env?.CI === "true";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results/playwright",
  fullyParallel: isCI,
  timeout: isCI ? 180_000 : 30_000,
  workers: 1,
  reporter: "line",
  expect: {
    timeout: isCI ? 15_000 : 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: isCI ? undefined : "msedge",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
