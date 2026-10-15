// localStorage can be unavailable (private mode, blocked storage) — never let that break the app.
// Keys are also read by the inline script in index.html to avoid a flash of the wrong theme.
export const STORAGE_KEYS = {
  theme: 'tf-theme',
  fontSize: 'tf-font-size',
  siderCollapsed: 'tf-sider-collapsed',
} as const

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}
