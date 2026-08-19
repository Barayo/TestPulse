import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { RunRowContent } from '@/components/RunList'
import { timeAgo } from '@/lib/timeAgo'
import type { components } from '@testpulse/shared/api'

type Run = components['schemas']['Run']

// The run comparison picker's two dropdowns used to be native <select>
// elements, which had no way to tell two same-named runs apart (design.md
// D9). This replaces them with a WAI-ARIA APG "Select-Only Combobox":
// options are role="option" rows reusing RunRowContent (name, pass-rate
// health, relative date) instead of Link — a Link's navigation semantics
// don't belong inside a selection control, so RunRow itself isn't reused
// wholesale, just its inner content. Keyboard roving keeps DOM focus on the
// trigger the whole time (aria-activedescendant), so Enter/Space firing a
// button's native click never fights the custom key handling below — all
// keyboard interaction is handled explicitly via onKeyDown with
// preventDefault, matching RowActionMenu.tsx's own click-outside/Escape
// idiom for the parts that carry over.
export function RunListbox({
  label,
  runs,
  value,
  onChange,
  placeholder,
}: {
  label: string
  runs: Run[]
  value: string
  onChange: (key: string) => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const selected = runs.find((r) => r.key === value)

  function close() {
    setOpen(false)
    setActiveIndex(-1)
  }

  function openPopup() {
    const startIndex = Math.max(
      0,
      runs.findIndex((r) => r.key === value),
    )
    setActiveIndex(runs.length > 0 ? startIndex : -1)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        openPopup()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, runs.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const run = runs[activeIndex]
      if (run) {
        onChange(run.key)
        close()
      }
    }
  }

  function select(run: Run) {
    onChange(run.key)
    close()
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label={label}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-option-${runs[activeIndex]?.key}` : undefined}
        onClick={() => (open ? close() : openPopup())}
        onKeyDown={onTriggerKeyDown}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-sm hover:bg-accent"
      >
        {selected ? (
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <RunRowContent run={selected} />
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">{placeholder}</span>
        )}
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-card py-1 shadow-lg"
        >
          {runs.map((run, i) => (
            <li
              key={run.key}
              id={`${listId}-option-${run.key}`}
              role="option"
              aria-selected={run.key === value}
              title={`${run.name} · ${timeAgo(run.createdAt)}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => select(run)}
              className={`flex cursor-pointer items-center gap-3 px-2 py-1.5 text-sm ${
                i === activeIndex ? 'bg-accent' : ''
              }`}
            >
              <RunRowContent run={run} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
