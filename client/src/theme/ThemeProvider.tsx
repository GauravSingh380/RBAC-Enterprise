import { App as AntApp, ConfigProvider, theme as antdTheme, type ThemeConfig } from 'antd'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { FONT_SIZE, ThemeContext, type ThemeContextValue, type ThemeMode } from './ThemeContext'
import { STORAGE_KEYS, readStorage, writeStorage } from './storage'

const BRAND_COLOR = '#3e63dd'

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

// Follows the OS dark-mode setting live
function useSystemDark() {
  return useSyncExternalStore(
    (onChange) => {
      const query = darkQuery()
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    () => darkQuery().matches,
  )
}

const clampFont = (size: number) => Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, Math.round(size)))

function initialMode(): ThemeMode {
  const stored = readStorage(STORAGE_KEYS.theme)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

function initialFontSize(): number {
  const stored = Number(readStorage(STORAGE_KEYS.fontSize))
  return stored ? clampFont(stored) : FONT_SIZE.default
}

/**
 * Global look & feel: light / dark / system mode and app-wide font size.
 * Everything is driven by Ant Design tokens, so all components scale together.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode)
  const [fontSize, setFontSizeState] = useState<number>(initialFontSize)
  const systemDark = useSystemDark()
  const isDark = mode === 'dark' || (mode === 'system' && systemDark)

  const themeConfig = useMemo<ThemeConfig>(() => {
    const scale = fontSize / FONT_SIZE.default
    return {
      algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        colorPrimary: BRAND_COLOR,
        borderRadius: 8,
        fontSize,
        // Scale control heights with the font so inputs/buttons stay proportional
        controlHeight: Math.round(32 * scale),
        controlHeightSM: Math.round(24 * scale),
        controlHeightLG: Math.round(40 * scale),
        fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      },
      components: {
        Layout: { headerPadding: '0 20px' },
      },
    }
  }, [isDark, fontSize])

  // Keep <html> in sync for anything outside Ant Design (scrollbars, body background, rem units)
  useEffect(() => {
    const root = document.documentElement
    const tokens = antdTheme.getDesignToken(themeConfig)
    root.dataset.theme = isDark ? 'dark' : 'light'
    root.style.colorScheme = isDark ? 'dark' : 'light'
    root.style.fontSize = `${fontSize}px`
    document.body.style.background = tokens.colorBgLayout
    document.body.style.color = tokens.colorText
  }, [isDark, fontSize, themeConfig])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    writeStorage(STORAGE_KEYS.theme, next)
  }, [])

  const setFontSize = useCallback((size: number) => {
    const next = clampFont(size)
    setFontSizeState(next)
    writeStorage(STORAGE_KEYS.fontSize, String(next))
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      isDark,
      setMode,
      toggleDark: () => setMode(isDark ? 'light' : 'dark'),
      fontSize,
      setFontSize,
      increaseFont: () => setFontSize(fontSize + 1),
      decreaseFont: () => setFontSize(fontSize - 1),
      resetFont: () => setFontSize(FONT_SIZE.default),
    }),
    [mode, isDark, setMode, fontSize, setFontSize],
  )

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider theme={themeConfig}>
        {/* AntApp provides theme-aware message / notification / modal via App.useApp() */}
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  )
}
