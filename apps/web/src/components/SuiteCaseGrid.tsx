import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { CasePicker, type CasePickerCase, type CasePickerFolder } from './CasePicker'

export type SuiteCaseGridFolder = CasePickerFolder
export type SuiteCaseGridCase = CasePickerCase

export { computeVisibleRange } from './CasePicker'

// Design decision (rework-suite-membership-ux design.md): one shared
// component drives both suite creation and membership editing. Instead of
// an internal 'create' | 'edit' mode branch, the parent fully controls the
// commit affordance (label/disabled/handler) — the grid only ever renders
// the picker plus a selection count and whatever commit button it's told to.
//
// rework-run-creation-ux extracted the picker mechanics themselves (section
// tree, search, filters, virtualization) into CasePicker so run creation can
// reuse the exact same picker; this component is now that footer wrapped
// around it.
export function SuiteCaseGrid({
  cases,
  folders,
  selected,
  onToggle,
  onToggleRange,
  commitLabel,
  commitDisabled,
  onCommit,
  onExit,
  readOnly = false,
}: {
  cases: SuiteCaseGridCase[]
  folders: SuiteCaseGridFolder[]
  selected: Set<string>
  onToggle: (caseId: string) => void
  // Passed straight through to CasePicker (redesign-case-picker-membership)
  // — no logic of its own here, same as onToggle above.
  onToggleRange: (caseIds: string[], checked: boolean) => void
  commitLabel: string
  commitDisabled: boolean
  onCommit: () => void
  // Returns the caller to whatever "view" state it came from, discarding any
  // uncommitted selection changes (rework-suite-run-flow design.md D3) — the
  // grid otherwise has no way to be left once entered.
  onExit: () => void
  // Disables the picker's checkboxes and hides the selection-count/commit
  // footer entirely — there's nothing to commit if the caller can't edit
  // (unify-authenticated-and-public-views tasks.md 2.2).
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <CasePicker
        cases={cases}
        folders={folders}
        selected={selected}
        onToggle={onToggle}
        onToggleRange={onToggleRange}
        readOnly={readOnly}
      />

      {readOnly ? (
        <div className="flex justify-end rounded-md border bg-accent px-4 py-2.5">
          <Button type="button" variant="outline" onClick={onExit}>
            {t('SuiteCaseGrid.doneButton')}
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-md border bg-accent px-4 py-2.5">
          <span className="text-sm font-medium">
            {selected.size === 0 ? t('SuiteCaseGrid.noCasesSelected') : t('SuiteCaseGrid.selectedCount', { count: selected.size })}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onExit}>
              {t('SuiteCaseGrid.cancelButton')}
            </Button>
            <Button type="button" disabled={commitDisabled} onClick={onCommit}>
              {commitLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
