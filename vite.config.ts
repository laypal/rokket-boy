import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// HRD.3 build stamp: short git SHA + date, rendered on the title screen and
// returned by the staging report(). Falls back for a sourceless checkout.
function buildStamp(): string {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();
    return `${sha} ${new Date().toISOString().slice(0, 10)}`;
  } catch {
    return 'unknown';
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [viteSingleFile()],
  define: {
    __BUILD__: JSON.stringify(buildStamp()),
    // D4 (2026-08-11): prod ships clean — window.__rokket.report() exists
    // only in the staging build (`npm run build:staging`, second Coolify app).
    __STAGING__: JSON.stringify(mode === 'staging'),
  },
  server: {
    // lets the containerised Playwright MCP browser reach the dev server
    allowedHosts: ['host.docker.internal'],
  },
  build: {
    target: 'es2020',
    // one self-contained HTML file; postbuild renames index.html → team-rokket.html
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 5000,
    rolldownOptions: {
      output: {
        // HRD.7: a stray console/debugger can never ship. Vite 8 minifies via
        // the Oxc minifier — this replaces the old `esbuild.drop` shape.
        // mangle/codegen stay explicitly on: a partial minify object must not
        // silently turn the rest of minification off.
        minify: {
          compress: { dropConsole: true, dropDebugger: true },
          mangle: true,
          codegen: true,
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
