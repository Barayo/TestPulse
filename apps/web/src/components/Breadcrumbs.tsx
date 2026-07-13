import { Link } from 'react-router-dom'

export type Crumb = { label: string; href?: string }

export function Breadcrumbs({ segments }: { segments: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="tp-label flex items-center gap-2">
      {segments.map((segment, i) => {
        const isLast = i === segments.length - 1
        return (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true">›</span>}
            {!isLast && segment.href ? (
              <Link to={segment.href} className="hover:text-foreground">
                {segment.label}
              </Link>
            ) : (
              <span className={isLast ? 'text-foreground' : undefined}>{segment.label}</span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
