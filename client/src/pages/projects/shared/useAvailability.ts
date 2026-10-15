// Availability of the project's people for the next ~2.5 months (one request per project).
import { useCallback, useMemo } from 'react'
import { useFetch } from '../../../hooks/useFetch'
import { capacityService } from '../../../services/notifications.service'
import type { Availability } from '../../../types/notifications'

const AHEAD_DAYS = 75

export function useAvailability(projectKey: string) {
  const res = useFetch(
    useCallback(() => {
      // computed when the request runs (not during render)
      const from = new Date().toISOString().slice(0, 10)
      const to = new Date(Date.now() + AHEAD_DAYS * 86_400_000).toISOString().slice(0, 10)
      return capacityService.availability(projectKey, from, to)
    }, [projectKey]),
  )
  return useMemo(() => new Map<number, Availability>((res.data ?? []).map((a) => [a.user.id, a])), [res.data])
}
