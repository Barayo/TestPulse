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
  commitLabel,
  commitDisabled,
  onCommit,
  readOnly = false,
}: {
  cases: SuiteCaseGridCase[]
  folders: SuiteCaseGridFolder[]
  selected: Set<string>
  onToggle: (caseId: string) => void
  commitLabel: string
  commitDisabled: boolean
  onCommit: () => void
  // Disables the picker's checkboxes and hides the selection-count/commit
  // footer entirely — there's nothing to commit if the caller can't edit
  // (unify-authenticated-and-public-views tasks.md 2.2).
  readOnly?: boolean
}) {
  return (
    <div className="space-y-3">
      <CasePicker cases={cases} folders={folders} selected={selected} onToggle={onToggle} readOnly={readOnly} />

      {!readOnly && (
        <div className="flex items-center justify-between rounded-md border bg-accent px-4 py-2.5">
          <span className="text-sm font-medium">
            {selected.size === 0 ? 'No cases selected' : `${selected.size} selected`}
          </span>
          <Button type="button" disabled={commitDisabled} onClick={onCommit}>
            {commitLabel}
          </Button>
        </div>
      )}
    </div>
  )
}
