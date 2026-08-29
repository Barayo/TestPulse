import { useEffect, useState } from 'react'
import { ListChecksIcon, FileTextIcon, ScrollTextIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { ClassificationEditor, type Priority } from '@/components/ClassificationEditor'
import { StepEditor, type Step } from '@/components/StepEditor'
import { GherkinEditor } from '@/components/GherkinEditor'
import { useCaseFormatSwitch, CASE_FORMAT_LABELS, type CaseFormat } from '@/lib/useCaseFormatSwitch'

export type { Step } from '@/components/StepEditor'
export type { CaseFormat } from '@/lib/useCaseFormatSwitch'

const FORMAT_ICONS: Record<CaseFormat, typeof ListChecksIcon> = {
  steps: ListChecksIcon,
  text: FileTextIcon,
  gherkin: ScrollTextIcon,
}

export type ClassificationFields = {
  priority: Priority
  tags: string[]
  platform: string
  testType: string
  automated: boolean
}

type Props = {
  mode: 'create'
  open: boolean
  onClose: () => void
  folderName: string
  onCreate: (
    input: { title: string; steps: Step[]; description: string; format: CaseFormat; gherkinSource: string } & ClassificationFields,
  ) => void
}

function textToTags(text: string): string[] {
  return text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

const DEFAULT_CLASSIFICATION: ClassificationFields = {
  priority: 'medium',
  tags: [],
  platform: '',
  testType: '',
  automated: false,
}

export function CaseDrawer({ open, onClose, folderName, onCreate }: Props) {
  const [title, setTitle] = useState('')
  const [format, setFormat] = useState<CaseFormat>('steps')
  const [steps, setSteps] = useState<Step[]>([{ action: '', expected: '' }])
  const [description, setDescription] = useState('')
  const [gherkinSource, setGherkinSource] = useState('')
  const [priority, setPriority] = useState<Priority>(DEFAULT_CLASSIFICATION.priority)
  const [tagsText, setTagsText] = useState('')
  const [platform, setPlatform] = useState('')
  const [testType, setTestType] = useState('')
  const [automated, setAutomated] = useState(false)

  const hasContentFor = (f: CaseFormat) => {
    if (f === 'steps') return steps.some((s) => s.action.trim())
    if (f === 'text') return description.trim() !== ''
    return gherkinSource.trim() !== ''
  }
  const { pendingFormat, requestFormat, confirmSwitch, cancelSwitch } = useCaseFormatSwitch(format, hasContentFor)

  useEffect(() => {
    setTitle('')
    setFormat('steps')
    setSteps([{ action: '', expected: '' }])
    setDescription('')
    setGherkinSource('')
    setPriority(DEFAULT_CLASSIFICATION.priority)
    setTagsText('')
    setPlatform('')
    setTestType('')
    setAutomated(false)
  }, [open])

  if (!open) return null

  function pickFormat(next: CaseFormat) {
    const applied = requestFormat(next)
    if (applied) setFormat(applied)
  }

  function confirmFormatSwitch() {
    const next = confirmSwitch()
    if (!next) return
    setSteps([{ action: '', expected: '' }])
    setDescription('')
    setGherkinSource('')
    setFormat(next)
  }

  function submitCreate() {
    if (!title.trim()) return
    onCreate({
      title: title.trim(),
      steps: steps.filter((s) => s.action.trim()),
      description,
      format,
      gherkinSource,
      priority,
      tags: textToTags(tagsText),
      platform: platform.trim(),
      testType: testType.trim(),
      automated,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <div
        role="dialog"
        aria-label="New test case"
        className="flex h-full w-[420px] flex-col gap-4 overflow-y-auto bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="tp-heading text-lg">New test case</h2>
            <p className="text-sm text-muted-foreground">in {folderName}</p>
          </div>
          <button type="button" aria-label="Dismiss" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="space-y-1">
          <label htmlFor="case-title" className="text-sm font-medium">
            Title
          </label>
          <Input id="case-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <ClassificationEditor
          priority={priority}
          tagsText={tagsText}
          platform={platform}
          testType={testType}
          automated={automated}
          onPriorityChange={setPriority}
          onTagsTextChange={setTagsText}
          onPlatformChange={setPlatform}
          onTestTypeChange={setTestType}
          onAutomatedChange={setAutomated}
        />

        <div className="space-y-1">
          <label className="text-sm font-medium">Format</label>
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
        </div>

        {format === 'steps' && <StepEditor steps={steps} onChange={setSteps} />}
        {format === 'text' && (
          <div className="flex flex-1 flex-col space-y-1">
            <label htmlFor="case-description" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="case-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the scenario, prerequisites, and expected outcome in your own words…"
              className="flex-1"
            />
          </div>
        )}
        {format === 'gherkin' && <GherkinEditor value={gherkinSource} onChange={setGherkinSource} />}

        <div className="mt-auto flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submitCreate}>Create test case</Button>
        </div>
      </div>

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
            . This only changes what&rsquo;s in the editor — nothing is saved until you create this case.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={cancelSwitch}>
              Cancel
            </Button>
            <Button onClick={confirmFormatSwitch}>Switch format</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
