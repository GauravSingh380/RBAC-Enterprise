// Centralised API access for the whole app — import from here, not from axios directly.
//
//   const users = await api.get<Paginated<User>>('/users', { page: 1 })
//   await api.post('/roles', body)
//   await api.get('/users', params, { signal })   // cancellable
//
// Every call resolves with the `data` field of the server's { success, data } envelope,
// and rejects with an ApiError (status, message, field errors, requestId).
import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import { http } from './http/client'

export { http } from './http/client'
export { ApiError, getErrorMessage, type FieldError } from './http/errors'
export { onSessionChange, refreshSession, setAccessToken, setActiveOrganizationId, takeSessionEndMessage } from './http/session'
export { PASSWORD_CHANGE_EVENT } from './http/client'

type Params = Record<string, string | number | boolean | undefined | null>
type Config = Omit<AxiosRequestConfig, 'url' | 'method' | 'data' | 'params'>

interface Envelope<T> {
  success: boolean
  data: T
}

// Drop empty values so they don't end up as ?search=&page=
function cleanParams(params?: Params) {
  if (!params) return undefined
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))
}

const unwrap = <T>(request: Promise<AxiosResponse<Envelope<T>>>): Promise<T> =>
  request.then((res) => res.data?.data as T) // 204 No Content resolves to undefined

export const api = {
  get: <T>(url: string, params?: Params, config?: Config) =>
    unwrap<T>(http.get(url, { ...config, params: cleanParams(params) })),
  post: <T>(url: string, body?: unknown, config?: Config) => unwrap<T>(http.post(url, body, config)),
  put: <T>(url: string, body?: unknown, config?: Config) => unwrap<T>(http.put(url, body, config)),
  patch: <T>(url: string, body?: unknown, config?: Config) => unwrap<T>(http.patch(url, body, config)),
  delete: <T = void>(url: string, config?: Config) => unwrap<T>(http.delete(url, config)),

  /** multipart upload of one file (form field "file") with progress callback */
  upload: <T>(url: string, file: File | Blob, onProgress?: (percent: number) => void) => {
    const form = new FormData()
    form.append('file', file)
    return unwrap<T>(
      http.post(url, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => onProgress?.(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
      }),
    )
  },

  /** authenticated binary download (attachments) → Blob */
  blob: (url: string, params?: Params) =>
    http.get<Blob>(url, { params: cleanParams(params), responseType: 'blob' }).then((res) => res.data),
}

/** Saves a Blob as a file in the browser. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
