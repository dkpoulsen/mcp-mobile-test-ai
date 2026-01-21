import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  testMatch: "**/*.spec.ts",
  // Use tsx to run TypeScript files directly
  // This allows running tests without building first

  // Artifact capture configuration
  outputDir: "test-artifacts",
  timeout: 60000,

  // Screenshot configuration
  use: {
    screenshot: {
      mode: "only-on-failure",
      fullPage: true,
    },
    video: {
      mode: "retain-on-failure",
      size: { width: 1280, height: 720 },
    },
    trace: {
      mode: "retain-on-failure",
      screenshots: true,
      snapshots: true,
    },
  },

  // Projects for different artifact capture modes
  projects: [
    {
      name: "default",
      use: {
        // Default artifact capture settings
      },
    },
    {
      name: "full-artifacts",
      use: {
        screenshot: "on",
        video: "on",
        trace: "on",
      },
    },
  ],
});
