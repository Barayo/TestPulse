import { Textarea } from '@/components/ui/textarea'

export type Step = { action: string; expected: string }

export function StepEditor({ steps, onChange }: { steps: Step[]; onChange: (steps: Step[]) => void }) {
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
          <Textarea
            aria-label={`Action for step ${i + 1}`}
            value={step.action}
            onChange={(e) => update(i, 'action', e.target.value)}
            placeholder="Action…"
            rows={2}
            className="min-h-0"
          />
          <Textarea
            aria-label={`Expected result for step ${i + 1}`}
            value={step.expected}
            onChange={(e) => update(i, 'expected', e.target.value)}
            placeholder="Expected result…"
            rows={2}
            className="min-h-0"
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
