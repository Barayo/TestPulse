import { ListChecksIcon, FileTextIcon, ScrollTextIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { CaseStepsList } from '@/components/CaseStepsList'
import { GherkinEditor } from '@/components/GherkinEditor'
import { useCaseFormatSwitch, CASE_FORMAT_LABELS, type CaseFormat } from '@/lib/useCaseFormatSwitch'
import type { components } from '@testpulse/shared/api'

type Step = components['schemas']['Step']

const FORMAT_ICONS: Record<CaseFormat, typeof ListChecksIcon> = {
  steps: ListChecksIcon,
  text: FileTextIcon,
  gherkin: ScrollTextIcon,
}

// The format picker + content body + confirm-before-switch dialog, shared
// by CreateCasePage and CaseDetailPage's in-place edit mode
// (redesign-case-creation-as-page) — the two previously duplicated this
// markup almost verbatim. A controlled component: callers keep owning
// title/classification state and their own save/create action; only this
// picker+editor+dialog unit is shared.
export function CaseFormatEditor({
  format,
  steps,
  description,
  gherkinSource,
  onFormatChange,
  onStepsChange,
  onDescriptionChange,
  onGherkinSourceChange,
}: {
  format: CaseFormat
  steps: Step[]
  description: string
  gherkinSource: string
  onFormatChange: (format: CaseFormat) => void
  onStepsChange: (steps: Step[]) => void
  onDescriptionChange: (description: string) => void
  onGherkinSourceChange: (gherkinSource: string) => void
}) {
  const hasContentFor = (f: CaseFormat) => {
    if (f === 'steps') return steps.some((s) => s.action.trim())
    if (f === 'text') return description.trim() !== ''
    return gherkinSource.trim() !== ''
  }
  const { pendingFormat, requestFormat, confirmSwitch, cancelSwitch } = useCaseFormatSwitch(format, hasContentFor)

  function pickFormat(next: CaseFormat) {
    const applied = requestFormat(next)
    if (applied) onFormatChange(applied)
  }

  function confirmFormatSwitch() {
    const next = confirmSwitch()
    if (!next) return
    onStepsChange([{ action: '', expected: '' }])
    onDescriptionChange('')
    onGherkinSourceChange('')
    onFormatChange(next)
  }

  return (
    <>
      <div role="group" aria-label="Format" className="inline-flex gap-0.5 rounded-2xl bg-muted p-1">
        {(Object.keys(CASE_FORMAT_LABELS) as CaseFormat[]).map((f) => {
          const Icon = FORMAT_ICONS[f]
          const isActive = f === format
          return (
            <button
              key={f}
              type="button"
              aria-pressed={isActive}
              onClick={() => pickFormat(f)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold ${
                isActive ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className={`size-4 ${isActive ? 'text-primary' : ''}`} aria-hidden="true" />
              {CASE_FORMAT_LABELS[f]}
            </button>
          )
        })}
      </div>

      {format === 'steps' && <CaseStepsList steps={steps} onChange={onStepsChange} />}
      {format === 'text' && (
        <Card>
          <CardContent>
            <Textarea
              aria-label="Description"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Describe the scenario, prerequisites, and expected outcome in your own words…"
              className="min-h-40 border-none bg-transparent p-0 text-base leading-relaxed shadow-none focus-visible:ring-0"
            />
          </CardContent>
        </Card>
      )}
      {format === 'gherkin' && <GherkinEditor value={gherkinSource} onChange={onGherkinSourceChange} />}

      <Dialog open={pendingFormat !== null} onOpenChange={(next) => !next && cancelSwitch()}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Switch to {pendingFormat ? CASE_FORMAT_LABELS[pendingFormat] : ''}?</DialogTitle>
          <DialogDescription>
            Switching clears{' '}
            {format === 'steps'
              ? "the steps you've written"
              : format === 'text'
                ? "the description you've written"
                : "the Given/When/Then scenario you've written"}
            . This only changes what&rsquo;s in the editor — nothing is saved yet.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={cancelSwitch}>
              Cancel
            </Button>
            <Button onClick={confirmFormatSwitch}>Switch format</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
