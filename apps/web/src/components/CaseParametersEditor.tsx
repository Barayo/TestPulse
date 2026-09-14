import { useState } from 'react'
import { PlusIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { components } from '@testpulse/shared/api'

type CaseParameters = components['schemas']['CaseParameters']
type Step = components['schemas']['Step']

const NAME_COLUMN = 'Name'

function placeholdersIn(steps: Step[]): Set<string> {
  const found = new Set<string>()
  const pattern = /\{([^{}]+)\}/g
  for (const step of steps) {
    for (const text of [step.action, step.expected]) {
      if (!text) continue
      for (const m of text.matchAll(pattern)) found.add(m[1])
    }
  }
  return found
}

function nextColumnName(existing: string[]): string {
  let n = existing.length
  while (existing.includes(`column${n}`)) n++
  return `column${n}`
}

function renameKey<T>(row: Record<string, T>, from: string, to: string): Record<string, T> {
  const next: Record<string, T> = {}
  for (const [k, v] of Object.entries(row)) next[k === from ? to : k] = v
  return next
}

// The Steps-format case editor's optional data-driven table
// (add-parameterized-cases), placed in the primary content column below
// CaseStepsList per Pepe's approved mock — a spreadsheet, not a form, so
// cells use the borderless "invisible until focused" idiom already used
// for the case title rather than boxed Input components. Always rendered
// (an always-available section, not a separate toggle): zero rows shows a
// quiet empty state, and adding the first row is what makes a case
// parameterized (add-parameterized-cases design.md).
export function CaseParametersEditor({
  parameters,
  steps,
  onChange,
}: {
  parameters?: CaseParameters
  steps: Step[]
  onChange: (parameters: CaseParameters | undefined) => void
}) {
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)
  const columns = parameters?.columns ?? [NAME_COLUMN]
  const rows = parameters?.rows ?? []

  if (rows.length === 0) {
    return (
      <div>
        <p className="tp-label mb-2">Test Data</p>
        <div className="flex items-center justify-between gap-4">
          <p className="max-w-lg text-sm text-muted-foreground">
            Run this case with several sets of input values instead of duplicating it — add a data table below.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange({ columns: [NAME_COLUMN], rows: [{ [NAME_COLUMN]: '' }] })}
          >
            + Add test data
          </Button>
        </div>
      </div>
    )
  }

  const usedPlaceholders = placeholdersIn(steps)
  const otherColumns = columns.filter((c) => c !== NAME_COLUMN)

  function update(next: CaseParameters) {
    setBlockedMessage(null)
    onChange(next)
  }

  function renameColumn(col: string, next: string) {
    if (next !== col && (next === NAME_COLUMN || columns.includes(next))) {
      setBlockedMessage(`"${next}" is already a column name.`)
      return
    }
    update({
      columns: columns.map((c) => (c === col ? next : c)),
      rows: rows.map((r) => renameKey(r, col, next)),
    })
  }

  function removeColumn(col: string) {
    if (usedPlaceholders.has(col)) {
      setBlockedMessage(`"${col}" is used in a step and can't be removed.`)
      return
    }
    update({
      columns: columns.filter((c) => c !== col),
      rows: rows.map((r) => {
        const { [col]: _removed, ...rest } = r
        return rest
      }),
    })
  }

  function addColumn() {
    const col = nextColumnName(columns)
    update({
      columns: [...columns, col],
      rows: rows.map((r) => ({ ...r, [col]: '' })),
    })
  }

  function updateCell(rowIndex: number, col: string, value: string) {
    update({
      columns,
      rows: rows.map((r, i) => (i === rowIndex ? { ...r, [col]: value } : r)),
    })
  }

  function addRow() {
    const blank = Object.fromEntries(columns.map((c) => [c, '']))
    update({ columns, rows: [...rows, blank] })
  }

  function removeRow(rowIndex: number) {
    update({ columns, rows: rows.filter((_, i) => i !== rowIndex) })
  }

  return (
    <div>
      <p className="tp-label mb-2">Test Data</p>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/70">
                <th className="border-b px-3 py-2 text-left font-semibold whitespace-nowrap">
                  <input
                    aria-label="Name column"
                    title="Required, always first"
                    value={NAME_COLUMN}
                    readOnly
                    className="tp-label w-auto min-w-[4ch] border-none bg-transparent text-foreground outline-none"
                  />
                </th>
                {otherColumns.map((col, i) => (
                  <th key={i} className="group border-b px-3 py-2 text-left font-semibold whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <input
                        aria-label={`Column ${i + 1}`}
                        value={col}
                        placeholder="Column name"
                        onChange={(e) => renameColumn(col, e.target.value)}
                        className="tp-label w-auto min-w-[4ch] rounded border-none bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      />
                      <button
                        type="button"
                        aria-label={`Remove column ${col}`}
                        className="text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                        onClick={() => removeColumn(col)}
                      >
                        <XIcon className="size-3" aria-hidden="true" />
                      </button>
                    </div>
                  </th>
                ))}
                <th className="w-9 border-b px-1.5 py-1.5">
                  <button
                    type="button"
                    aria-label="Add column"
                    className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={addColumn}
                  >
                    <PlusIcon className="size-3.5" aria-hidden="true" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="last:[&_td]:border-b-0">
                  <td className="border-b px-1 py-0.5">
                    <input
                      aria-label={`Row ${i + 1} name`}
                      value={row[NAME_COLUMN] ?? ''}
                      placeholder="Row name"
                      onChange={(e) => updateCell(i, NAME_COLUMN, e.target.value)}
                      className="w-full min-w-[7ch] rounded-md border-none bg-transparent p-2 text-sm font-semibold outline-none focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/45"
                    />
                  </td>
                  {otherColumns.map((col, ci) => (
                    <td key={ci} className="border-b px-1 py-0.5">
                      <input
                        aria-label={`Row ${i + 1} ${col}`}
                        value={row[col] ?? ''}
                        placeholder="Value"
                        onChange={(e) => updateCell(i, col, e.target.value)}
                        className="w-full min-w-[7ch] rounded-md border-none bg-transparent p-2 text-sm outline-none focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/45"
                      />
                    </td>
                  ))}
                  <td className="border-b px-1 py-0.5 text-center">
                    <button
                      type="button"
                      aria-label={`Remove row ${i + 1}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(i)}
                    >
                      <XIcon className="size-3.5" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-4 px-(--card-spacing) py-3">
            <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={addRow}>
              + Add row
            </button>
          </div>
        </CardContent>
      </Card>
      {blockedMessage && <p className="mt-1.5 text-xs text-destructive">{blockedMessage}</p>}
    </div>
  )
}
