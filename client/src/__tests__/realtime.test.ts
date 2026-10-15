import { describe, expect, it } from 'vitest'
import { isRelevant } from '../hooks/useRealtime'
import { CLIENT_ID } from '../lib/clientId'
import type { RealtimeEvent } from '../lib/realtime'

const event = (over: Partial<RealtimeEvent> = {}): RealtimeEvent => ({
  type: 'items',
  action: 'updated',
  organizationId: 1,
  projectId: 10,
  itemIds: [5, 6],
  actorId: 2,
  clientId: 'another-tab',
  at: new Date().toISOString(),
  ...over,
})

describe('realtime event filter', () => {
  it('reacts to changes in this project made elsewhere', () => {
    expect(isRelevant(event(), 10, ['items'])).toBe(true)
  })

  it('ignores other projects, other event types and our own tab', () => {
    expect(isRelevant(event({ projectId: 11 }), 10, ['items'])).toBe(false)
    expect(isRelevant(event({ type: 'sprints' }), 10, ['items'])).toBe(false)
    expect(isRelevant(event({ clientId: CLIENT_ID }), 10, ['items'])).toBe(false)
  })

  it('can watch a single item', () => {
    expect(isRelevant(event(), 10, ['items'], 6)).toBe(true)
    expect(isRelevant(event(), 10, ['items'], 7)).toBe(false)
  })
})
