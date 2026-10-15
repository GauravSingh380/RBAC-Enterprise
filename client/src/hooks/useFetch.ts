import { useCallback, useEffect, useState } from 'react'
import { getErrorMessage } from '../lib/api'

interface Result<T> {
  data: T | null
  error: string | null
  fetcher: unknown
  version: number
}

/**
 * Loads data on mount and whenever `fetcher` changes (wrap it in useCallback).
 * Call `reload()` after a mutation to fetch again. `loading` is true while a
 * request for the current fetcher/version is in flight (previous data stays visible).
 */
export function useFetch<T>(fetcher: () => Promise<T>) {
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<Result<T>>({ data: null, error: null, fetcher: null, version: -1 })

  useEffect(() => {
    let active = true
    fetcher()
      .then((data) => active && setResult({ data, error: null, fetcher, version }))
      .catch((err) => active && setResult((r) => ({ ...r, error: getErrorMessage(err), fetcher, version })))
    return () => {
      active = false
    }
  }, [fetcher, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const loading = result.fetcher !== fetcher || result.version !== version

  return { data: result.data, error: result.error, loading, reload }
}
