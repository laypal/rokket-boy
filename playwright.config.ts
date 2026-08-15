import process from 'node:process';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  // HRD.6: retries + machine-readable report under CI only — local runs keep
  // failing fast and loud
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [['list'], ['json', { outputFile: 'test-results/e2e-report.json' }]]
    : 'list',
  use: {
    // 5199, not 5173: interactive dev owns 5173 and foreign dev servers have
    // squatted it twice (war story 03) — e2e gets its own port.
    baseURL: 'http://localhost:5199',
    viewport: { width: 480, height: 800 },
  },
  webServer: {
    // --strictPort: fail loudly if 5199 is taken instead of Vite silently
    // hopping ports. reuseExistingServer stays false so Playwright never
    // tests against a server it didn't start.
    command: 'npm run dev -- --port 5199 --strictPort',
    port: 5199,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
