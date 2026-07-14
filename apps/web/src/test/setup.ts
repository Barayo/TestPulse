import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

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
