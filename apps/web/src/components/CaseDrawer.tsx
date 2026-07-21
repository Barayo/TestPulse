import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ClassificationEditor, type Priority } from '@/components/ClassificationEditor'
import { StepEditor, type Step } from '@/components/StepEditor'

export type { Step } from '@/components/StepEditor'

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
  onCreate: (input: { title: string; steps: Step[] } & ClassificationFields) => void
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
  const [steps, setSteps] = useState<Step[]>([{ action: '', expected: '' }])
  const [priority, setPriority] = useState<Priority>(DEFAULT_CLASSIFICATION.priority)
  const [tagsText, setTagsText] = useState('')
  const [platform, setPlatform] = useState('')
  const [testType, setTestType] = useState('')
  const [automated, setAutomated] = useState(false)

  useEffect(() => {
    setTitle('')
    setSteps([{ action: '', expected: '' }])
    setPriority(DEFAULT_CLASSIFICATION.priority)
    setTagsText('')
    setPlatform('')
    setTestType('')
    setAutomated(false)
  }, [open])

  if (!open) return null

  function submitCreate() {
    if (!title.trim()) return
    onCreate({
      title: title.trim(),
      steps: steps.filter((s) => s.action.trim()),
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
        <StepEditor steps={steps} onChange={setSteps} />

        <div className="mt-auto flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submitCreate}>Create test case</Button>
        </div>
      </div>
    </div>
  )
}
