/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // Dev-time proxy so the UI can call the Go API on its own origin.
      '/api': 'http://localhost:8080',
      '/healthz': 'http://localhost:8080',
      '/readyz': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // perf/discover-urls.mjs is real, unit-testable logic (add-web-
    // performance-lighthouse design.md D3) — wired into the normal test +
    // coverage run like src/**. Its sibling run.mjs/lighthouserc.json are
    // config/tooling with no failing-test-first equivalent, so they stay
    // out of both globs, same exemption apps/api/perf/'s k6 script has.
    include: ['src/**/*.test.{ts,tsx}', 'perf/*.test.mjs'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'perf/discover-urls.mjs'],
      exclude: ['src/components/ui/**', 'src/main.tsx', 'src/test/**'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
})
