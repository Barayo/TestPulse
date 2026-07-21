import { Input } from '@/components/ui/input'
import type { components } from '@testpulse/shared/api'

export type Priority = components['schemas']['Priority']

export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical']

export function ClassificationEditor({
  priority,
  tagsText,
  platform,
  testType,
  automated,
  onPriorityChange,
  onTagsTextChange,
  onPlatformChange,
  onTestTypeChange,
  onAutomatedChange,
}: {
  priority: Priority
  tagsText: string
  platform: string
  testType: string
  automated: boolean
  onPriorityChange: (v: Priority) => void
  onTagsTextChange: (v: string) => void
  onPlatformChange: (v: string) => void
  onTestTypeChange: (v: string) => void
  onAutomatedChange: (v: boolean) => void
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="case-priority" className="text-sm font-medium">
            Priority
          </label>
          <select
            id="case-priority"
            value={priority}
            onChange={(e) => onPriorityChange(e.target.value as Priority)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end pb-1.5">
          <label htmlFor="case-automated" className="flex items-center gap-2 text-sm font-medium">
            <input
              id="case-automated"
              type="checkbox"
              checked={automated}
              onChange={(e) => onAutomatedChange(e.target.checked)}
              className="size-4 rounded border-input"
            />
            Automated
          </label>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="case-platform" className="text-sm font-medium">
            Platform
          </label>
          <Input
            id="case-platform"
            value={platform}
            onChange={(e) => onPlatformChange(e.target.value)}
            placeholder="e.g. web, iOS"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="case-test-type" className="text-sm font-medium">
            Test type
          </label>
          <Input
            id="case-test-type"
            value={testType}
            onChange={(e) => onTestTypeChange(e.target.value)}
            placeholder="e.g. unit, e2e"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor="case-tags" className="text-sm font-medium">
          Tags
        </label>
        <Input
          id="case-tags"
          value={tagsText}
          onChange={(e) => onTagsTextChange(e.target.value)}
          placeholder="e.g. smoke, regression"
        />
      </div>
    </div>
  )
}
