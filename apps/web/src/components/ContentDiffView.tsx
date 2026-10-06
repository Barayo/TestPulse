import { useTranslation } from 'react-i18next'
import type { ContentDiff } from '@/lib/versionDiff'

// Shared by VersionDetailDialog (the full diff view) and CaseDetailPage's
// inline version-row expand (rework-case-detail-ux) — one diff renderer,
// not two copies drifting apart.
export function ContentDiffView({ diff }: { diff: ContentDiff }) {
  const { t } = useTranslation()
  if (diff.fields.length === 0 && diff.steps.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('ContentDiffView.noChanges')}</p>
  }
  return (
    <div className="space-y-2">
      {diff.fields.map((f) => (
        <div key={f.label} className="text-sm">
          <span className="tp-label mr-1.5 text-muted-foreground">{f.label}:</span>
          <span className="text-muted-foreground line-through">{f.before || '—'}</span>
          <span className="mx-1.5">→</span>
          <span>{f.after || '—'}</span>
        </div>
      ))}
      {diff.steps.map((s) => (
        <div key={s.index} className="text-sm">
          <span className="tp-label mr-1.5 text-muted-foreground">{t('ContentDiffView.stepLabel', { index: s.index + 1 })}</span>
          {s.kind === 'added' && <span>{s.after!.action}</span>}
          {s.kind === 'removed' && <span className="text-muted-foreground line-through">{s.before!.action}</span>}
          {s.kind === 'changed' && (
            <div className="space-y-0.5 pl-1">
              {s.before!.action !== s.after!.action && (
                <div>
                  <span className="text-muted-foreground line-through">{s.before!.action}</span>
                  <span className="mx-1.5">→</span>
                  <span>{s.after!.action}</span>
                </div>
              )}
              {s.before!.expected !== s.after!.expected && (
                <div>
                  <span className="text-muted-foreground line-through">{s.before!.expected || '—'}</span>
                  <span className="mx-1.5">→</span>
                  <span>{s.after!.expected || '—'}</span>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
