import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 15_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5180",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @blackboard/backend dev",
      cwd: "../..",
      reuseExistingServer: false,
      timeout: 30_000,
      url: "http://127.0.0.1:3001/api/sessions/demo/snapshot",
    },
    {
      command: "pnpm --filter @blackboard/frontend exec vite --host 127.0.0.1 --port 5180 --strictPort",
      cwd: "../..",
      reuseExistingServer: false,
      timeout: 30_000,
      url: "http://127.0.0.1:5180",
    },
  ],
});
