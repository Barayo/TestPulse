import type { components } from '@testpulse/shared/api'

type CaseContent = components['schemas']['CaseContent']
type Step = components['schemas']['Step']

export type FieldDiff = { label: string; before: string; after: string }
export type StepDiff = { index: number; kind: 'added' | 'removed' | 'changed'; before?: Step; after?: Step }
export type ContentDiff = { fields: FieldDiff[]; steps: StepDiff[] }

type ScalarField = { label: string; get: (c: CaseContent) => string }

const SCALAR_FIELDS: ScalarField[] = [
  { label: 'Title', get: (c) => c.title },
  { label: 'Format', get: (c) => c.format ?? 'steps' },
  { label: 'Description', get: (c) => c.description ?? '' },
  { label: 'Scenario', get: (c) => c.gherkinSource ?? '' },
  { label: 'Expected result', get: (c) => c.expectedResult ?? '' },
  { label: 'Priority', get: (c) => c.priority ?? '' },
  { label: 'Tags', get: (c) => (c.tags ?? []).join(', ') },
  { label: 'Platform', get: (c) => c.platform ?? '' },
  { label: 'Test type', get: (c) => c.testType ?? '' },
  { label: 'Automated', get: (c) => (c.automated ? 'Yes' : 'No') },
]

// customFieldDefs is the project's *live* field definitions only — a
// version's customFields value for a since-deleted field id simply has no
// matching def and is silently excluded from the diff (add-case-custom-fields
// design.md D6: deleting a field drops it from historical diffs too, not
// just future ones).
export function diffContent(
  before: CaseContent,
  after: CaseContent,
  customFieldDefs: { id: string; name: string }[] = [],
): ContentDiff {
  const allFields: ScalarField[] = [
    ...SCALAR_FIELDS,
    ...customFieldDefs.map((def) => ({
      label: def.name,
      get: (c: CaseContent) => c.customFields?.[def.id] ?? '',
    })),
  ]
  const fields = allFields.filter((f) => f.get(before) !== f.get(after)).map((f) => ({
    label: f.label,
    before: f.get(before),
    after: f.get(after),
  }))

  const beforeSteps = before.steps ?? []
  const afterSteps = after.steps ?? []
  const steps: StepDiff[] = []
  const maxLen = Math.max(beforeSteps.length, afterSteps.length)
  for (let i = 0; i < maxLen; i++) {
    const b = beforeSteps[i]
    const a = afterSteps[i]
    if (b && !a) steps.push({ index: i, kind: 'removed', before: b })
    else if (!b && a) steps.push({ index: i, kind: 'added', after: a })
    else if (b && a && (b.action !== a.action || b.expected !== a.expected)) {
      steps.push({ index: i, kind: 'changed', before: b, after: a })
    }
  }
  return { fields, steps }
}

// Terse summary for a version-history row — a hint, not a diff view
// (mockup.html's diffSignal). Deliberately capped at listing field names
// only up to 2; beyond that it collapses to a count.
export function diffSignal(diff: ContentDiff): string {
  const labels = diff.fields.map((f) => f.label)
  if (diff.steps.length > 0) labels.push('Steps')
  if (labels.length === 0) return 'No changes'
  if (labels.length <= 2) return `${labels.join(', ')} changed`
  return `${labels.length} fields changed`
}
