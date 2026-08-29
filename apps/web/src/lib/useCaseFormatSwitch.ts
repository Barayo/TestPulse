import { useState } from 'react'

export type CaseFormat = 'steps' | 'text' | 'gherkin'

export const CASE_FORMAT_LABELS: Record<CaseFormat, string> = {
  steps: 'Steps',
  text: 'Free text',
  gherkin: 'Gherkin',
}

// Shared switch-confirmation logic, used inside CaseFormatEditor
// (add-case-authoring-formats design.md): switching format away from one
// with non-empty content warns first, since there is no auto-transform
// between formats — confirming clears the abandoned format's content
// rather than leaving stale values in state.
export function useCaseFormatSwitch(format: CaseFormat, hasContent: (format: CaseFormat) => boolean) {
  const [pendingFormat, setPendingFormat] = useState<CaseFormat | null>(null)

  function requestFormat(next: CaseFormat): CaseFormat | null {
    if (next === format) return null
    if (hasContent(format)) {
      setPendingFormat(next)
      return null
    }
    return next
  }

  function confirmSwitch(): CaseFormat | null {
    const next = pendingFormat
    setPendingFormat(null)
    return next
  }

  function cancelSwitch() {
    setPendingFormat(null)
  }

  return { pendingFormat, requestFormat, confirmSwitch, cancelSwitch }
}
