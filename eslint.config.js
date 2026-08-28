import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // .opencode/ holds OpenCode harness plugins (own SDK types, not app code)
  { ignores: ['dist/', 'node_modules/', 'team-rokket.html', 'playwright-report/', 'test-results/', '.opencode/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // ported engine code intentionally uses these patterns
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly', Buffer: 'readonly', URL: 'readonly' } },
  },
  {
    // PKG.3: the service worker runs in a worker scope, not a window
    files: ['public/sw.js'],
    languageOptions: { globals: { self: 'readonly', caches: 'readonly', fetch: 'readonly', Response: 'readonly' } },
  },
  {
    // HRD.7: lock in what's already true of src/ — zero stray logs, zero any,
    // zero ts-suppressions. console.error stays allowed: Tier A's error paths
    // (save/scenes/diagnostics) use it deliberately in dev, and the build
    // drops every console.* anyway (vite.config esbuild.drop).
    files: ['src/**/*.ts'],
    rules: {
      'no-console': ['error', { allow: ['error'] }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
    },
  },
);
