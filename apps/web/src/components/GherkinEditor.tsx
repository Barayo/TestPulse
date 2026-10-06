import { useTranslation } from 'react-i18next'
import { Textarea } from '@/components/ui/textarea'

export function GherkinEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-1 flex-col space-y-1">
      <Textarea
        aria-label={t('GherkinEditor.scenarioAriaLabel')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('GherkinEditor.placeholder')}
        className="flex-1 rounded-lg border bg-card p-4 font-mono text-sm leading-relaxed"
      />
      <p className="text-xs text-muted-foreground">{t('GherkinEditor.syntaxHint')}</p>
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
