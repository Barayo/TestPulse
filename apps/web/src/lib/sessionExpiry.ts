// Bridges api.ts (a plain module, no React context) to AuthProvider, which
// is the only thing that gets to decide what a mid-use 401 means
// (handle-session-expiry).
const listeners = new Set<() => void>()

export function onSessionExpired(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function notifySessionExpired(): void {
  for (const listener of listeners) listener()
}
