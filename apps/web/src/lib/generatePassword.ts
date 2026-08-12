// Excludes visually-ambiguous characters (0/O, 1/l/I) — this value is
// routinely relayed out of band (chat, in person) and may be retyped, not
// always pasted, so ambiguity here is a real usability/lockout risk.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

// crypto.getRandomValues, never Math.random — this stands in for a real
// credential. Rejection sampling avoids the modulo bias a naive
// `byte % ALPHABET.length` would introduce.
export function generateSecurePassword(length = 20): string {
  const max = 256 - (256 % ALPHABET.length)
  let result = ''
  const buf = new Uint8Array(length)
  while (result.length < length) {
    crypto.getRandomValues(buf)
    for (const byte of buf) {
      if (result.length === length) break
      if (byte < max) result += ALPHABET[byte % ALPHABET.length]
    }
  }
  return result
}
