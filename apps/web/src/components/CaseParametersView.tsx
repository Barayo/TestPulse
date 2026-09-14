import { Card, CardContent } from '@/components/ui/card'
import type { components } from '@testpulse/shared/api'

type CaseParameters = components['schemas']['CaseParameters']

// Read-only counterpart to CaseParametersEditor (add-parameterized-cases):
// the case's own unsubstituted template view, shown below CaseContentView
// only when the case actually has rows — substitution only ever happens
// at the run-item level, where a concrete row is known.
export function CaseParametersView({ parameters }: { parameters: CaseParameters }) {
  const otherColumns = parameters.columns.filter((c) => c !== 'Name')

  return (
    <div>
      <p className="tp-label mb-2">Test Data</p>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/70">
                <th className="border-b px-3 py-2 text-left font-semibold whitespace-nowrap">Name</th>
                {otherColumns.map((col) => (
                  <th key={col} className="border-b px-3 py-2 text-left font-semibold whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parameters.rows.map((row, i) => (
                <tr key={i} className="hover:bg-muted/50 last:[&_td]:border-b-0">
                  <td className="border-b px-3 py-2 font-semibold whitespace-nowrap">{row.Name}</td>
                  {otherColumns.map((col) => (
                    <td key={col} className="border-b px-3 py-2 whitespace-nowrap">
                      {row[col]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
