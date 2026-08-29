#!/usr/bin/env node
// One-time dogfooding setup: creates a TestPulse project mirroring the
// apps/web/e2e/*.spec.ts suite (one section per file, one case per
// "Scenario:" title), then tags each test with the resulting case key via
// test.info().annotations so the JUnit importer (docs/importing-results.md)
// can match CI results back to these cases. Re-running is not idempotent —
// it always creates a new project.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env.TESTPULSE_BASE_URL ?? 'https://testpulse.fly.dev'
const TOKEN = process.env.TESTPULSE_TOKEN
if (!TOKEN) {
  console.error('TESTPULSE_TOKEN env var is required')
  process.exit(1)
}

const REPO_ROOT = join(import.meta.dirname, '..', '..')
const E2E_DIR = join(REPO_ROOT, 'apps/web/e2e')

const SECTION_LABELS = {
  'change-own-password.spec.ts': 'Change own password',
  'delete-mode.spec.ts': 'Delete mode',
  'first-run-setup.spec.ts': 'First-run setup',
  'forgot-password.spec.ts': 'Forgot password',
  'platform-deployment.spec.ts': 'Platform & deployment',
  'profile.spec.ts': 'Profile',
  'project-rbac.spec.ts': 'Project RBAC',
  'public-project-access.spec.ts': 'Public project access',
  'run-item-attachments.spec.ts': 'Run item attachments',
  'scoped-api-tokens.spec.ts': 'Scoped API tokens',
  'session-expiry.spec.ts': 'Session expiry',
  'session-timeout-setting.spec.ts': 'Session timeout setting',
  'teams.spec.ts': 'Teams',
  'test-authoring.spec.ts': 'Test authoring',
  'test-execution.spec.ts': 'Test execution',
  'ui-navigation.spec.ts': 'UI navigation',
  'ui-theming.spec.ts': 'UI theming',
  'update-user.spec.ts': 'Update user',
}

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`)
  }
  return res.status === 204 ? null : res.json()
}

function unescapeQuoted(raw) {
  return raw.replace(/\\(.)/g, '$1')
}

function parseSpecFile(text) {
  const lines = text.split('\n')
  const items = []
  const describeRe = /^\s*test\.describe\(\s*(['"])((?:\\.|(?!\1).)*)\1/
  const testRe = /^\s*test\(\s*(['"])((?:\\.|(?!\1).)*)\1/
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const d = describeRe.exec(line)
    if (d) {
      items.push({ kind: 'describe', lineIndex: i, title: unescapeQuoted(d[2]) })
      continue
    }
    const t = testRe.exec(line)
    if (t) items.push({ kind: 'test', lineIndex: i, title: unescapeQuoted(t[2]) })
  }
  return { lines, items }
}

function stripPrefix(title, prefix) {
  return title.startsWith(prefix) ? title.slice(prefix.length) : title
}

async function main() {
  console.log('Creating project...')
  const project = await api('POST', '/api/v1/projects', {
    name: 'TestPulse (dogfood)',
    description:
      "TestPulse's own e2e suite, imported as a real project — the dogfooding validation loop described in ROADMAP.md v0.1.",
  })
  console.log(`Project ${project.key} created (id ${project.id})`)

  const folders = await api('GET', `/api/v1/projects/${project.key}/folders`)
  const root = folders.find((f) => !f.parentFolderId)
  if (!root) throw new Error('root folder not found on new project')

  const files = readdirSync(E2E_DIR)
    .filter((f) => f.endsWith('.spec.ts'))
    .sort()

  const manifest = { projectKey: project.key, projectId: project.id, files: {} }

  for (const file of files) {
    const label = SECTION_LABELS[file] ?? file.replace('.spec.ts', '')
    console.log(`\n${file} -> section "${label}"`)
    const section = await api('POST', `/api/v1/projects/${project.key}/folders`, {
      name: label,
      parentFolderId: root.id,
    })

    const fullPath = join(E2E_DIR, file)
    const original = readFileSync(fullPath, 'utf8')
    const { lines, items } = parseSpecFile(original)

    let currentRequirement = ''
    const insertions = []
    const fileMap = []

    for (const item of items) {
      if (item.kind === 'describe') {
        currentRequirement = stripPrefix(item.title, 'Requirement: ')
        continue
      }
      const scenario = stripPrefix(item.title, 'Scenario: ')
      const caseTitle = `${currentRequirement} — ${scenario}`

      const testCase = await api('POST', `/api/v1/projects/${project.key}/cases`, {
        title: caseTitle,
        folderId: section.id,
        testType: 'e2e',
        platform: 'web',
        automated: true,
        tags: ['e2e', 'dogfood'],
      })
      console.log(`  ${testCase.key}  ${caseTitle}`)

      // The test's own body opens on whichever line ends in "=> {" — the
      // signature often wraps across multiple lines for destructured
      // fixture params, so scan forward from the test( line to find it.
      let bodyOpenLine = item.lineIndex
      while (bodyOpenLine < lines.length && !/=>\s*\{\s*$/.test(lines[bodyOpenLine])) {
        bodyOpenLine++
      }
      const indent = (/^\s*/.exec(lines[bodyOpenLine + 1] ?? '') ?? [''])[0]
      insertions.push({
        afterLine: bodyOpenLine,
        text: `${indent}test.info().annotations.push({ type: 'testpulse_case_key', description: '${testCase.key}' })`,
      })
      fileMap.push({ testTitle: item.title, caseKey: testCase.key, caseTitle })
    }

    insertions.sort((a, b) => b.afterLine - a.afterLine)
    for (const ins of insertions) {
      lines.splice(ins.afterLine + 1, 0, ins.text)
    }
    writeFileSync(fullPath, lines.join('\n'))
    manifest.files[file] = { sectionId: section.id, sectionLabel: label, cases: fileMap }
  }

  mkdirSync(join(REPO_ROOT, 'scripts/dogfood'), { recursive: true })
  writeFileSync(join(REPO_ROOT, 'scripts/dogfood/case-map.json'), JSON.stringify(manifest, null, 2))
  console.log(`\nDone. Project key: ${project.key}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
