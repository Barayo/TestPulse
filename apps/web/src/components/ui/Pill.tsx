// Segmented pill control, shared across ProjectsPage.tsx's status-filter
// chips and the theme toggle (add-dark-mode-toggle) — active = solid dark
// fill, inactive = white/bordered, matching the approved mockup's
// filter-chip treatment throughout.
export function Pill({
  active,
  onClick,
  children,
  ...rest
}: { active: boolean; onClick: () => void; children: React.ReactNode } & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'className'
>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card text-muted-foreground hover:text-foreground'
      }`}
      {...rest}
    >
      {children}
    </button>
  )
}
