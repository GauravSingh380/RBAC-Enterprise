import axios, { type AxiosError } from 'axios'

export type ApiErrorCode = 'HTTP' | 'NETWORK' | 'TIMEOUT' | 'CANCELED'

export interface FieldError {
  field: string
  message: string
}

/** The single error type every API call rejects with. */
export class ApiError extends Error {
  status: number
  code: ApiErrorCode
  errors?: FieldError[]
  /** Matches the X-Request-Id in the server logs — quote it when reporting a bug. */
  requestId?: string
  /** The server's machine-readable reason, e.g. PLAN_LIMIT_REACHED, PASSWORD_CHANGE_REQUIRED */
  reason?: string

  constructor(
    message: string,
    options: { status?: number; code?: ApiErrorCode; errors?: FieldError[]; requestId?: string; reason?: string } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status ?? 0
    this.code = options.code ?? 'HTTP'
    this.errors = options.errors
    this.requestId = options.requestId
    this.reason = options.reason
  }
}

interface ErrorBody {
  message?: string
  errors?: FieldError[]
  requestId?: string
  code?: string
}

/** Converts any axios failure into an ApiError with a user-friendly message. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (axios.isCancel(error)) return new ApiError('Request was cancelled', { code: 'CANCELED' })
  if (!axios.isAxiosError(error)) {
    return new ApiError(error instanceof Error ? error.message : 'Something went wrong')
  }

  const err = error as AxiosError<ErrorBody>
  const requestId = (err.config?.headers?.get('X-Request-Id') as string | undefined) ?? undefined

  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
    return new ApiError('The server took too long to respond. Please try again.', { code: 'TIMEOUT', requestId })
  }
  if (!err.response) {
    return new ApiError('Cannot reach the server. Check your connection and try again.', { code: 'NETWORK', requestId })
  }

  const { status, data, headers } = err.response
  return new ApiError(data?.message ?? `Request failed (${status})`, {
    status,
    errors: data?.errors,
    reason: data?.code,
    requestId: data?.requestId ?? (headers['x-request-id'] as string | undefined) ?? requestId,
  })
}

/** Turns any thrown value into a message for the UI (server errors include a reference id). */
export function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.status >= 500 && err.requestId ? `${err.message} (ref: ${err.requestId.slice(0, 8)})` : err.message
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong'
}
