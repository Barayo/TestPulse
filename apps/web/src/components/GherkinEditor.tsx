import { Textarea } from '@/components/ui/textarea'

const PLACEHOLDER = `Given a logged-in customer with an active subscription
When they cancel their subscription from account settings
Then the subscription status shows Cancelled
And no further charges are made`

export function GherkinEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-1 flex-col space-y-1">
      <Textarea
        aria-label="Scenario"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={PLACEHOLDER}
        className="flex-1 rounded-lg border bg-card p-4 font-mono text-sm leading-relaxed"
      />
      <p className="text-xs text-muted-foreground">Start each line with Given, When, Then, And, or But.</p>
    </div>
  )
}

const KEYWORD_RE = /^(\s*)(Given|When|Then|And|But)\b(.*)$/i
const CONTINUATION_RE = /^(and|but)$/i

export function GherkinView({ source }: { source: string }) {
  const lines = source.split('\n')
  return (
    <div className="rounded-lg border bg-card p-4 font-mono text-sm leading-relaxed">
      {lines.map((line, i) => {
        const match = KEYWORD_RE.exec(line)
        if (!match) {
          return (
            <div key={i} className="whitespace-pre-wrap">
              {line}
            </div>
          )
        }
        const [, , keyword, rest] = match
        const isContinuation = CONTINUATION_RE.test(keyword)
        return (
          <div key={i} className={`whitespace-pre-wrap ${isContinuation ? 'pl-4' : ''}`}>
            <span className="font-semibold">{keyword}</span>
            {rest}
          </div>
        )
      })}
    </div>
  )
}
