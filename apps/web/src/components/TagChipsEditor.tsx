import { useState } from 'react'
import { PlusIcon, XIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'

// Removable chip row (CustomFieldsCard's exact option-chip idiom, minus the
// drag handle/reorder menu tags don't need) + a typeahead input reusing the
// shared vocabulary (add-project-tags) — the backend normalizes every tag
// to lowercase/trimmed, so the list of suggestions genuinely *is* the
// existing vocabulary, no separate "(existing)" labeling required. Only a
// string with no exact match gets a visually distinguished "add new" row.
export function TagChipsEditor({
  tags,
  vocabulary,
  onAdd,
  onRemove,
}: {
  tags: string[]
  vocabulary: string[]
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
}) {
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLowerCase()
  const suggestions = vocabulary.filter(
    (t) => !tags.includes(t) && (normalized === '' || t.toLowerCase().includes(normalized)),
  )
  const exactMatch = vocabulary.some((t) => t.toLowerCase() === normalized)

  function commit(tag: string) {
    if (!tag) return
    onAdd(tag)
    setQuery('')
  }

  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <li key={t} className="flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2 text-xs">
              <span>{t}</span>
              <button
                type="button"
                aria-label={`Remove ${t}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(t)}
              >
                <XIcon className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        placeholder="Add a tag…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(normalized)
          }
        }}
      />
      {normalized !== '' && (
        <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border bg-card p-1">
          {suggestions.map((t) => (
            <li key={t}>
              <button
                type="button"
                className="block w-full rounded-md px-2 py-1 text-left text-sm hover:bg-accent"
                onClick={() => commit(t)}
              >
                {t}
              </button>
            </li>
          ))}
          {!exactMatch && (
            <li>
              <button
                type="button"
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm text-primary hover:bg-accent"
                onClick={() => commit(normalized)}
              >
                <PlusIcon className="size-3.5" aria-hidden="true" />
                Add &quot;{query.trim()}&quot; as a new tag
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
