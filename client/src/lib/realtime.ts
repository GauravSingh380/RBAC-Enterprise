// One live connection per browser tab, shared by every page that wants updates.
//
//   1. POST /api/realtime/ticket      (normal axios call → Bearer token + organization)
//   2. new EventSource('/api/realtime/stream?ticket=…')   (EventSource can't send headers)
//   3. the server pushes tiny events: { type: 'items', projectId, itemIds, action, clientId }
//   4. pages re-fetch what they show (through the normal API → normal access checks)
//
// The connection opens when the first page subscribes and closes shortly after the last one
// leaves. If it drops (server restart, network, expired ticket) we fetch a NEW ticket and
// reconnect with backoff, then emit "resync" so pages refresh whatever they may have missed.
import { APP_ENV } from '../config/env'
import { api } from './api'
import { getActiveOrganizationId } from './http/session'

export type RealtimeStatus = 'connecting' | 'live' | 'offline'

export interface RealtimeEvent {
  type: 'items' | 'sprints' | 'views' | 'tests' | 'notifications'
  action: 'created' | 'updated' | 'deleted' | 'moved' | 'commented' | 'started' | 'completed'
  organizationId: number
  projectId: number
  itemIds?: number[]
  sprintId?: number
  runId?: number
  actorId: number | null
  clientId: string | null
  at: string
}

/** `resync`: events may have been missed — reload everything that is on screen. */
export type RealtimeMessage = { kind: 'event'; event: RealtimeEvent } | { kind: 'resync' }

type Listener = (message: RealtimeMessage) => void

const listeners = new Set<Listener>()
const statusListeners = new Set<(s: RealtimeStatus) => void>()
let source: EventSource | null = null
let status: RealtimeStatus = 'offline'
let connectedOrg: number | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null
let attempt = 0
let generation = 0 // ignores late callbacks of an old connection
let hadConnection = false

function setStatus(next: RealtimeStatus) {
  if (status === next) return
  status = next
  statusListeners.forEach((l) => l(next))
}

const emit = (message: RealtimeMessage) => listeners.forEach((l) => l(message))

function disconnect() {
  generation++
  source?.close()
  source = null
  connectedOrg = null
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  setStatus('offline')
}

async function connect() {
  const myGeneration = ++generation
  const organizationId = getActiveOrganizationId()
  if (!organizationId || typeof EventSource === 'undefined') return setStatus('offline')
  setStatus('connecting')
  try {
    const { ticket } = await api.post<{ ticket: string }>('/realtime/ticket')
    if (myGeneration !== generation) return
    const es = new EventSource(`${APP_ENV.apiBaseUrl}/realtime/stream?ticket=${encodeURIComponent(ticket)}`)
    source = es
    connectedOrg = organizationId

    es.addEventListener('ready', () => {
      if (myGeneration !== generation) return
      attempt = 0
      setStatus('live')
      if (hadConnection) emit({ kind: 'resync' }) // a reconnect: catch up on missed changes
      hadConnection = true
    })
    for (const type of ['items', 'sprints', 'views', 'tests', 'notifications'] as const) {
      es.addEventListener(type, (e) => {
        try {
          emit({ kind: 'event', event: JSON.parse((e as MessageEvent).data) as RealtimeEvent })
        } catch {
          /* ignore malformed */
        }
      })
    }
    es.addEventListener('resync', () => emit({ kind: 'resync' }))
    es.addEventListener('revoked', () => disconnect())
    // The browser would retry with the same (soon expired) ticket — we reconnect ourselves instead
    es.onerror = () => {
      if (myGeneration !== generation) return
      es.close()
      scheduleReconnect()
    }
  } catch {
    if (myGeneration === generation) scheduleReconnect()
  }
}

function scheduleReconnect() {
  source = null
  setStatus(listeners.size ? 'connecting' : 'offline')
  if (!listeners.size) return
  const delay = Math.min(30_000, 1000 * 2 ** attempt++) + Math.random() * 500
  retryTimer = setTimeout(() => {
    retryTimer = null
    void connect()
  }, delay)
}

/** Receive realtime messages. Returns the unsubscribe function. */
export function subscribeRealtime(listener: Listener): () => void {
  listeners.add(listener)
  if (closeTimer) clearTimeout(closeTimer)
  closeTimer = null
  // first subscriber, or the organization changed since we connected
  const org = getActiveOrganizationId()
  if ((!source && !retryTimer && status !== 'connecting') || (source && connectedOrg !== org)) {
    disconnect()
    void connect()
  }
  return () => {
    listeners.delete(listener)
    // keep the connection a moment: navigating between pages re-subscribes immediately
    if (!listeners.size) closeTimer = setTimeout(disconnect, 5000)
  }
}

export function onRealtimeStatus(listener: (s: RealtimeStatus) => void): () => void {
  statusListeners.add(listener)
  listener(status)
  return () => statusListeners.delete(listener)
}

export const getRealtimeStatus = () => status
