import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
// Importing this registers the i18next singleton `useTranslation()` falls
// back to when a component isn't explicitly wrapped in an I18nextProvider
// (every existing test) — without it, `t('key')` returns the raw key in
// every test (add-ui-i18n).
import '@/i18n'

// jsdom doesn't implement matchMedia — default every test to "desktop"
// (no match) unless a test explicitly overrides it (e.g. useIsMobile tests).
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList
}

afterEach(() => {
  cleanup()
})
