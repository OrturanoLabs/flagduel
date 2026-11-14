import { defineConfig } from "@playwright/test";
const port = Number(process.env.FLAG_DUEL_TEST_PORT ?? 8080);
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  use: {
    browserName:
      process.env.FLAG_DUEL_TEST_BROWSER === "firefox" ? "firefox" : "chromium",
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "NODE_ENV=test tsx e2e/server.ts",
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
    timeout: 30000,
  },
  reporter: "list",
});
