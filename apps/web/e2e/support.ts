// Test data must be unique per run: E2E specs share one real database with
// no reset between tests (or between local re-runs against the same
// compose volume), so fixed names collide across runs.
export function unique(label: string): string {
  return `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}
