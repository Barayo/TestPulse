import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

export type Step = { action: string; expected: string }
export type CaseVersionSummary = { version: number; createdAt: string }

type CommonProps = {
  open: boolean
  onClose: () => void
  folderName: string
}

type CreateProps = CommonProps & {
  mode: 'create'
  onCreate: (input: { title: string; steps: Step[] }) => void
}

type ViewProps = CommonProps & {
  mode: 'view'
  caseTitle: string
  currentVersion: number
  steps: Step[]
  suiteNames: string[]
  versions: CaseVersionSummary[]
  onSaveEdit: (input: { title: string; steps: Step[] }) => void
}

type Props = CreateProps | ViewProps

function StepEditor({ steps, onChange }: { steps: Step[]; onChange: (steps: Step[]) => void }) {
  function update(i: number, field: keyof Step, value: string) {
    onChange(steps.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)))
  }
  function remove(i: number) {
    onChange(steps.filter((_, idx) => idx !== i))
  }
  function add() {
    onChange([...steps, { action: '', expected: '' }])
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[16px_1fr_1fr_20px] gap-2 text-xs font-medium text-muted-foreground">
        <span />
        <span>Action</span>
        <span>Expected result (optional)</span>
        <span />
      </div>
      {steps.map((step, i) => (
        <div key={i} className="grid grid-cols-[16px_1fr_1fr_20px] items-start gap-2">
          <span className="pt-1.5 text-xs text-muted-foreground">{i + 1}</span>
          <Input
            aria-label={`Action for step ${i + 1}`}
            value={step.action}
            onChange={(e) => update(i, 'action', e.target.value)}
            placeholder="Action…"
          />
          <Input
            aria-label={`Expected result for step ${i + 1}`}
            value={step.expected}
            onChange={(e) => update(i, 'expected', e.target.value)}
            placeholder="Expected result…"
          />
          <button
            type="button"
            aria-label={`Remove step ${i + 1}`}
            className="pt-1.5 text-muted-foreground hover:text-destructive"
            onClick={() => remove(i)}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="text-sm text-primary hover:underline" onClick={add}>
        + Add step
      </button>
    </div>
  )
}

export function CaseDrawer(props: Props) {
  const { open, onClose, folderName, mode } = props
  const [title, setTitle] = useState(mode === 'view' ? props.caseTitle : '')
  const [steps, setSteps] = useState<Step[]>(
    mode === 'view' ? props.steps : [{ action: '', expected: '' }],
  )
  const [isEditing, setIsEditing] = useState(mode === 'create')

  useEffect(() => {
    if (mode === 'view') {
      setTitle(props.caseTitle)
      setSteps(props.steps)
      setIsEditing(false)
    } else {
      setTitle('')
      setSteps([{ action: '', expected: '' }])
      setIsEditing(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, open])

  if (!open) return null

  function submitCreate() {
    if (mode !== 'create' || !title.trim()) return
    props.onCreate({ title: title.trim(), steps: steps.filter((s) => s.action.trim()) })
  }

  function submitEdit() {
    if (mode !== 'view' || !title.trim()) return
    props.onSaveEdit({ title: title.trim(), steps: steps.filter((s) => s.action.trim()) })
    setIsEditing(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <div
        role="dialog"
        aria-label={mode === 'create' ? 'New test case' : title}
        className="flex h-full w-[420px] flex-col gap-4 overflow-y-auto bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="tp-heading text-lg">{mode === 'create' ? 'New test case' : title}</h2>
            <p className="text-sm text-muted-foreground">in {folderName}</p>
          </div>
          <button type="button" aria-label="Dismiss" onClick={onClose}>
            ✕
          </button>
        </div>

        {mode === 'view' && !isEditing && (
          <div className="flex items-center gap-2">
            <Badge variant="outline">v{props.currentVersion}</Badge>
            {props.suiteNames.map((name) => (
              <Badge key={name} variant="secondary">
                {name}
              </Badge>
            ))}
          </div>
        )}

        {mode === 'create' || isEditing ? (
          <>
            <div className="space-y-1">
              <label htmlFor="case-title" className="text-sm font-medium">
                Title
              </label>
              <Input id="case-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <StepEditor steps={steps} onChange={setSteps} />
          </>
        ) : (
          mode === 'view' && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Steps</p>
              {props.steps.length === 0 ? (
                <p className="text-sm text-muted-foreground">No steps defined.</p>
              ) : (
                props.steps.map((s, i) => (
                  <div key={i} className="text-sm">
                    <span className="text-muted-foreground">{i + 1}. </span>
                    {s.action}
                    {s.expected && <div className="pl-4 text-xs text-muted-foreground">→ {s.expected}</div>}
                  </div>
                ))
              )}
            </div>
          )
        )}

        {mode === 'view' && !isEditing && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Version history</p>
            <ul aria-label="Version history" className="divide-y rounded-md border text-sm">
              {props.versions.map((v) => (
                <li key={v.version} className="flex items-center justify-between px-2 py-1.5">
                  <span>v{v.version}</span>
                  {v.version === props.currentVersion ? (
                    <Badge variant="default">current</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {new Date(v.createdAt).toLocaleDateString()}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-auto flex justify-end gap-2 border-t pt-4">
          {mode === 'create' && (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={submitCreate}>Create test case</Button>
            </>
          )}
          {mode === 'view' && !isEditing && (
            <>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button onClick={() => setIsEditing(true)}>Edit</Button>
            </>
          )}
          {mode === 'view' && isEditing && (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button onClick={submitEdit}>Save changes</Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
