// Central place for build-time configuration (set VITE_* variables in client/.env)
export const APP_ENV = {
  apiBaseUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? '/api',
  apiTimeoutMs: Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 30_000),
  isDev: import.meta.env.DEV,
  /** version of this bundle — sent with crash reports ("which release broke?") */
  appVersion: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev',
} as const
