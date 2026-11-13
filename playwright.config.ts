import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:8080", trace: "retain-on-failure" },
  webServer: {
    command: "NODE_ENV=test tsx e2e/server.ts",
    url: "http://127.0.0.1:8080/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
  reporter: "list",
});
