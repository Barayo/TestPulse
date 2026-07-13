import { Button } from '@/components/ui/button'
import { CasePicker } from '@/components/CasePicker'

type CaseRef = { id: string; title: string }

type Props = {
  open: boolean
  suiteName: string
  memberCases: CaseRef[]
  availableCases: CaseRef[]
  onClose: () => void
  onAddCase: (caseId: string) => void
  onRemoveCase: (caseId: string) => void
}

export function SuiteDrawer({ open, suiteName, memberCases, availableCases, onClose, onAddCase, onRemoveCase }: Props) {
  if (!open) return null

  const memberIds = new Set(memberCases.map((c) => c.id))
  const addable = availableCases.filter((c) => !memberIds.has(c.id))

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <div
        role="dialog"
        aria-label={suiteName}
        className="flex h-full w-[420px] flex-col gap-4 overflow-y-auto bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="tp-heading text-lg">{suiteName}</h2>
            <p className="text-sm text-muted-foreground">
              {memberCases.length} {memberCases.length === 1 ? 'case' : 'cases'}
            </p>
          </div>
          <button type="button" aria-label="Dismiss" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="space-y-2">
          {memberCases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cases yet in this suite.</p>
          ) : (
            <ul className="divide-y rounded-md border text-sm">
              {memberCases.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-2 py-1.5">
                  <span>{c.title}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${c.title}`}
                    onClick={() => onRemoveCase(c.id)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <CasePicker cases={addable} onSelect={onAddCase} />

        <div className="mt-auto flex justify-end border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
