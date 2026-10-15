import { createContext } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

export const FONT_SIZE = { min: 12, max: 20, default: 14 } as const

export interface ThemeContextValue {
  mode: ThemeMode
  isDark: boolean
  setMode: (mode: ThemeMode) => void
  toggleDark: () => void
  fontSize: number
  setFontSize: (size: number) => void
  increaseFont: () => void
  decreaseFont: () => void
  resetFont: () => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)
