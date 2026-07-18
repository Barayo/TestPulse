// Mirrors the backend's deliberately simple pattern (domain.ValidateEmail):
// one `@`, no whitespace, at least one `.` in the domain part. Catches
// obvious typos before a round trip, not a full RFC 5322 parser.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email)
}
