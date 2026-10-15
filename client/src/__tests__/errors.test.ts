import { AxiosError, AxiosHeaders } from 'axios'
import { describe, expect, it } from 'vitest'
import { ApiError, getErrorMessage, toApiError } from '../lib/http/errors'

const axiosError = (status: number | null, data?: unknown, code?: string) => {
  const config = { headers: new AxiosHeaders({ 'X-Request-Id': 'req-12345678' }) }
  const response = status === null ? undefined : { status, data, headers: {}, statusText: '', config }
  return new AxiosError('failed', code, config as never, null, response as never)
}

describe('toApiError', () => {
  it('uses the server message, status and field errors', () => {
    const err = toApiError(axiosError(400, { message: 'Title is required', errors: [{ field: 'title', message: 'Title is required' }] }))
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(400)
    expect(err.message).toBe('Title is required')
    expect(err.errors?.[0]?.field).toBe('title')
  })

  it('recognises network errors and timeouts', () => {
    expect(toApiError(axiosError(null)).code).toBe('NETWORK')
    expect(toApiError(axiosError(null, undefined, 'ECONNABORTED')).code).toBe('TIMEOUT')
  })
})

describe('getErrorMessage', () => {
  it('adds a reference id for server errors', () => {
    const err = new ApiError('Internal server error', { status: 500, requestId: 'abcdef1234' })
    expect(getErrorMessage(err)).toBe('Internal server error (ref: abcdef12)')
  })

  it('handles plain errors and unknown values', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom')
    expect(getErrorMessage(42)).toBe('Something went wrong')
  })
})
