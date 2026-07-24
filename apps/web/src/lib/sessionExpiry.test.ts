import { describe, expect, it, vi } from 'vitest'
import { notifySessionExpired, onSessionExpired } from './sessionExpiry'

describe('sessionExpiry', () => {
  it('calls a registered listener when notified', () => {
    const listener = vi.fn()
    onSessionExpired(listener)
    notifySessionExpired()
    expect(listener).toHaveBeenCalledOnce()
  })

  it('stops calling a listener after it unsubscribes', () => {
    const listener = vi.fn()
    const unsubscribe = onSessionExpired(listener)
    unsubscribe()
    notifySessionExpired()
    expect(listener).not.toHaveBeenCalled()
  })

  it('calls every registered listener', () => {
    const a = vi.fn()
    const b = vi.fn()
    onSessionExpired(a)
    onSessionExpired(b)
    notifySessionExpired()
    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledOnce()
  })
})
