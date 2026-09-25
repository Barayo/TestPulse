#!/usr/bin/env node
// Copies the OpenAPI contract and a vendored swagger-ui-dist build into
// apps/api/internal/apidocs, where they're embedded into the Go binary via
// go:embed (add-live-api-docs design.md D2) — mirroring how the root
// Makefile's sync-web target copies the built web UI into
// apps/api/internal/web/dist before compiling.
//
// swagger-initializer.js is rewritten, not copied verbatim: the upstream
// default points at the Petstore demo spec and leaves the external
// validator badge enabled, which would both be wrong for a self-hosted
// TestPulse instance and would violate the Content-Security-Policy shipped
// in add-content-security-policy (connect-src 'self').

import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const sharedDir = path.resolve(here, '..')
const repoRoot = path.resolve(sharedDir, '../..')
const swaggerUiDist = path.resolve(repoRoot, 'node_modules/swagger-ui-dist')
const apidocsDir = path.resolve(repoRoot, 'apps/api/internal/apidocs')
const distDir = path.join(apidocsDir, 'dist')

mkdirSync(distDir, { recursive: true })

cpSync(path.join(sharedDir, 'openapi.yaml'), path.join(apidocsDir, 'openapi.yaml'))

const staticAssets = [
  'index.html',
  'index.css',
  'swagger-ui.css',
  'swagger-ui-bundle.js',
  'swagger-ui-standalone-preset.js',
  'favicon-16x16.png',
  'favicon-32x32.png',
]
for (const name of staticAssets) {
  cpSync(path.join(swaggerUiDist, name), path.join(distDir, name))
}

// A <base> tag is required, not optional: GET /docs (no trailing slash) is
// the documented, expected entry point, and without it the browser
// resolves index.html's relative asset hrefs against "/" (docs' parent),
// not "/docs/" — every CSS/JS sub-request 404s/misroutes to the unrelated
// web-SPA catch-all instead of this package's own assets.
const indexHtml = readFileSync(path.join(distDir, 'index.html'), 'utf8')
const indexWithBase = indexHtml.replace('<head>', '<head>\n    <base href="/docs/">')
if (!indexWithBase.includes('<base href="/docs/">')) {
  throw new Error('sync-api-docs: index.html rewrite did not find <head> — check swagger-ui-dist version')
}
writeFileSync(path.join(distDir, 'index.html'), indexWithBase)

const initializer = readFileSync(path.join(swaggerUiDist, 'swagger-initializer.js'), 'utf8')
const rewritten = initializer
  .replace(
    /url:\s*["'][^"']*["']/,
    'url: "openapi.yaml"',
  )
  .replace(
    /dom_id:\s*['"]#swagger-ui['"],/,
    "dom_id: '#swagger-ui',\n    validatorUrl: null,",
  )
if (!rewritten.includes('url: "openapi.yaml"') || !rewritten.includes('validatorUrl: null')) {
  throw new Error('sync-api-docs: swagger-initializer.js rewrite did not match expected upstream shape — check swagger-ui-dist version')
}
writeFileSync(path.join(distDir, 'swagger-initializer.js'), rewritten)

console.log('Synced OpenAPI contract and swagger-ui-dist into apps/api/internal/apidocs')
