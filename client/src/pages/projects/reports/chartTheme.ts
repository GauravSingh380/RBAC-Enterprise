// Shared chart styling for the reports (recharts).
//
// Colour rules (validated with the dataviz palette checker, light AND dark):
//   series 1 = blue, series 2 = orange — distinct for colour-blind readers, >= 3:1 on the surface.
//   Dark mode uses its own steps of the same hues, not an automatic flip.
//   Text never wears a series colour; reference lines (ideal burndown) are neutral grey.
import { theme } from 'antd'
import { useTheme } from '../../../theme/useTheme'

export function useChartColors() {
  const { isDark } = useTheme()
  const { token } = theme.useToken()
  return {
    series1: isDark ? '#3987e5' : '#2a78d6',
    series2: isDark ? '#d95926' : '#eb6834',
    reference: isDark ? '#8b8a84' : '#a3a29c',
    /** severity is ORDERED → one hue, darker = more severe (light) / brighter = more severe (dark); validated ordinal ramps */
    severity: isDark
      ? { trivial: '#184f95', minor: '#2a78d6', major: '#5598e7', critical: '#9ec5f4', none: '#5c5b57' }
      : { trivial: '#86b6ef', minor: '#3987e5', major: '#1c5cab', critical: '#0d366b', none: '#c3c2b7' },
    grid: token.colorBorderSecondary,
    axis: token.colorTextSecondary,
    surface: token.colorBgContainer,
    tooltip: {
      contentStyle: {
        background: token.colorBgElevated,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: 8,
        boxShadow: token.boxShadowSecondary,
        color: token.colorText,
      },
      labelStyle: { color: token.colorText, fontWeight: 600 },
      itemStyle: { color: token.colorText },
    },
    tick: { fill: token.colorTextSecondary, fontSize: 12 },
  }
}

export const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
