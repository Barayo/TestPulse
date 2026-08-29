import { test, expect } from '@playwright/test'
import { unique } from './support'

// BDD E2E for add-forgot-password, mapped to
// openspec/changes/add-forgot-password/specs/password-recovery/spec.md
// scenarios.
// GIVEN: the compose stack is up (make e2e) with Mailpit bundled
// (deploy/compose/docker-compose.yml) — real SMTP delivery through the
// actual net/smtp code path, not a stub, read back via Mailpit's own REST
// API rather than a testing-only backdoor.

const MAILPIT_URL = 'http://localhost:8025'

type MailpitMessage = { ID: string; To: { Address: string }[] }
type MailpitMessageDetail = { Text: string }

// Polls Mailpit for the most recent message to `to`, returning its raw
// plain-text body. The API request and the SMTP send happen inside the
// same synchronous handler (net/smtp.SendMail blocks — service/identity.go
// ForgotPassword), so this resolves on the first or second attempt in
// practice; the poll just absorbs container scheduling jitter, not a real
// race with the send itself.
async function waitForResetEmail(to: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages`)
    const { messages } = (await res.json()) as { messages: MailpitMessage[] }
    const match = messages.find((m) => m.To.some((t) => t.Address === to))
    if (match) {
      const detail = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`)).json()) as MailpitMessageDetail
      return detail.Text
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`no reset email arrived for ${to} within the poll window`)
}

function extractResetLink(body: string): string {
  const match = body.match(/https?:\/\/\S+\/reset-password\?token=\S+/)
  if (!match) throw new Error(`email body did not contain a reset link: ${body}`)
  return match[0]
}

test.describe('Requirement: Self-service password recovery', () => {
  test('Scenario: Request a reset, redeem the emailed link, and log in with the new password', async ({
    page,
    browser,
  }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-8' })
    const email = `${unique('forgot-password').replace(/\s+/g, '-').toLowerCase()}@example.com`
    const oldPassword = 'correcthorse-original'
    const newPassword = 'correcthorse-reset'
    await page.request.post('/api/v1/users', { data: { email, password: oldPassword } })

    // A genuinely unauthenticated context — mirrors
    // public-project-access.spec.ts's anonymousPage: the default context's
    // storageState is the admin session, which would otherwise leak in and
    // make this test pass for the wrong reason (an already-authenticated
    // request, not a real self-service flow).
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const anon = await context.newPage()

    await anon.goto('/forgot-password')
    await anon.getByLabel(/email/i).fill(email)
    await anon.getByRole('button', { name: /send reset link/i }).click()
    await expect(anon.getByText(/check your email/i)).toBeVisible()

    const body = await waitForResetEmail(email)
    const link = extractResetLink(body)

    await anon.goto(link)
    await anon.getByLabel(/^new password$/i).fill(newPassword)
    await anon.getByLabel(/confirm new password/i).fill(newPassword)
    await anon.getByRole('button', { name: /reset password/i }).click()

    await anon.waitForURL('/login')
    await expect(anon.getByText(/password updated/i)).toBeVisible()

    const oldLogin = await anon.request.post('/api/v1/auth/login', { data: { email, password: oldPassword } })
    expect(oldLogin.ok()).toBe(false)
    const newLogin = await anon.request.post('/api/v1/auth/login', { data: { email, password: newPassword } })
    expect(newLogin.ok()).toBe(true)
  })

  // The negative case (passwordResetEnabled false when SMTP isn't
  // configured, so the link stays hidden) is already covered by
  // config package unit tests (TestLoadLoginRateLimitDefaults-adjacent
  // config_test.go coverage of PasswordResetEnabled) — not re-proven here,
  // since the compose stack always has Mailpit configured (design.md).
  test('Scenario: The login page offers self-service recovery when the instance has SMTP configured', async ({
    browser,
  }) => {
    test.info().annotations.push({ type: 'testpulse_case_key', description: 'TD-9' })
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const anon = await context.newPage()

    await anon.goto('/login')

    await expect(anon.getByRole('link', { name: /forgot password/i })).toHaveAttribute('href', '/forgot-password')
  })
})
