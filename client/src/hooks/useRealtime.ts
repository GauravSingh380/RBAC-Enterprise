// React side of lib/realtime.ts
//
//   useLiveReload(project.id, items.reload)                 → reload when items of the project change
//   useLiveReload(project.id, sprints.reload, ['sprints'])  → … when sprints change
//   const status = useRealtimeStatus()                      → 'live' | 'connecting' | 'offline'
import { useEffect, useRef, useState } from 'react'
import { CLIENT_ID } from '../lib/clientId'
import { onRealtimeStatus, subscribeRealtime, type RealtimeEvent, type RealtimeStatus } from '../lib/realtime'

export function useRealtimeStatus(): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>('offline')
  useEffect(() => onRealtimeStatus(setStatus), [])
  return status
}

/** Should this tab react to the event? (Not when it is our own change.) */
export function isRelevant(event: RealtimeEvent, projectId: number, types: RealtimeEvent['type'][], itemId?: number) {
  if (event.projectId !== projectId || !types.includes(event.type)) return false
  if (event.clientId && event.clientId === CLIENT_ID) return false
  if (itemId !== undefined) return !!event.itemIds?.includes(itemId)
  return true
}

/**
 * Calls `reload` (debounced — a bulk edit can produce several events at once) when something
 * in the project changes elsewhere: another person, another tab, or after a reconnect.
 * Pass `itemId` to only react to one work item (item page).
 */
export function useLiveReload(
  projectId: number | undefined,
  reload: () => void,
  types: RealtimeEvent['type'][] = ['items'],
  itemId?: number,
) {
  const reloadRef = useRef(reload)
  useEffect(() => {
    reloadRef.current = reload
  }, [reload])
  const typesKey = types.join(',')

  useEffect(() => {
    if (!projectId) return
    const wanted = typesKey.split(',') as RealtimeEvent['type'][]
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => reloadRef.current(), 250)
    }
    const unsubscribe = subscribeRealtime((message) => {
      if (message.kind === 'resync' || isRelevant(message.event, projectId, wanted, itemId)) schedule()
    })
    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [projectId, typesKey, itemId])
}

/**
 * My notifications changed (the server sends these only to the recipients) — or we reconnected.
 * Used by the bell; debounced like useLiveReload.
 */
export function useNotificationsLive(reload: () => void) {
  const reloadRef = useRef(reload)
  useEffect(() => {
    reloadRef.current = reload
  }, [reload])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = subscribeRealtime((message) => {
      if (message.kind === 'resync' || message.event.type === 'notifications') {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => reloadRef.current(), 200)
      }
    })
    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [])
}
