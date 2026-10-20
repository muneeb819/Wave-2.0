import { defineConfig } from "@playwright/test";

// Point at an existing production preview to avoid starting extra test servers.
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/ui.spec.ts",
  fullyParallel: true,
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: "list",
  outputDir: ".arena/test-results",
  use: {
    baseURL: externalBaseURL || "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1000 },
    headless: true,
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: externalBaseURL
    ? undefined
    : [
        {
          command:
            "python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --no-proxy-headers",
          url: "http://127.0.0.1:8000/api/health",
          reuseExistingServer: true,
        },
        {
          command: "npm run dev",
          url: "http://127.0.0.1:5173",
          reuseExistingServer: true,
        },
      ],
});
