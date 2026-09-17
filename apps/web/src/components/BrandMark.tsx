// Extracted from Layout.tsx (add-auth-split-screen-redesign) so the auth
// screen family (AuthLayout) and the post-login app header render the
// identical mark from one source instead of two hand-kept copies.
export function BrandMark() {
  return (
    <>
      <svg aria-hidden="true" viewBox="0 0 200 200" className="size-[26px] shrink-0 rounded-[5px]">
        <rect x="0" y="0" width="200" height="200" rx="44" ry="44" fill="url(#tp-wordmark-gradient)" />
        <defs>
          {/* Tracks --primary (add-color-theme-customization) instead
              of Teal's own hex values, so the wordmark follows
              whichever instance palette is active rather than being
              the one piece of brand chrome pinned to one preset.
              The second stop uses color-mix for a darker shade of
              the same hue — no separate "dark primary" token exists
              per palette, and this needs no new one. */}
          <linearGradient id="tp-wordmark-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="color-mix(in oklch, var(--primary), black 25%)" />
          </linearGradient>
        </defs>
        <path
          d="M35,112 L62,112 L78,74 L94,140 L112,112 L122,112 L138,130 L172,64"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={14}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>
        <span className="text-foreground tp-wordmark-test">Test</span>
        <span className="text-primary tp-wordmark-pulse">Pulse</span>
      </span>
    </>
  )
}
