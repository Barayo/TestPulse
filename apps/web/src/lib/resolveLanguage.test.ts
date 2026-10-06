import { describe, expect, it } from 'vitest'
import { resolveLanguage } from './resolveLanguage'

describe('resolveLanguage', () => {
  it('always returns the instance default when per-user customization is disabled, even if the user has a personal language', () => {
    expect(
      resolveLanguage({ perUserLanguageEnabled: false, defaultLanguage: 'en', userLanguage: 'es' }),
    ).toBe('en')
  })

  it("returns the user's personal language when per-user customization is enabled and they have one set", () => {
    expect(
      resolveLanguage({ perUserLanguageEnabled: true, defaultLanguage: 'en', userLanguage: 'fr' }),
    ).toBe('fr')
  })

  it('falls back to the instance default when per-user customization is enabled but the user has no personal language', () => {
    expect(
      resolveLanguage({ perUserLanguageEnabled: true, defaultLanguage: 'de', userLanguage: null }),
    ).toBe('de')
  })

  it('always returns the instance default for an anonymous visitor (no user at all), regardless of the per-user setting', () => {
    expect(
      resolveLanguage({ perUserLanguageEnabled: true, defaultLanguage: 'pt', userLanguage: undefined }),
    ).toBe('pt')
  })
})
