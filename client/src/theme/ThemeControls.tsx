import { BgColorsOutlined, DesktopOutlined, FontSizeOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import { Button, Divider, Flex, Popover, Segmented, Slider, Tooltip, Typography } from 'antd'
import { FONT_SIZE, type ThemeMode } from './ThemeContext'
import { useTheme } from './useTheme'

function DisplaySettings() {
  const { mode, setMode, fontSize, setFontSize, increaseFont, decreaseFont, resetFont } = useTheme()

  return (
    <Flex vertical gap={12} style={{ width: 260 }}>
      <div>
        <Typography.Text strong>Theme</Typography.Text>
        <Segmented<ThemeMode>
          block
          style={{ marginTop: 8 }}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'light', label: 'Light', icon: <SunOutlined /> },
            { value: 'dark', label: 'Dark', icon: <MoonOutlined /> },
            { value: 'system', label: 'System', icon: <DesktopOutlined /> },
          ]}
        />
      </div>

      <Divider style={{ margin: 0 }} />

      <div>
        <Flex justify="space-between" align="center">
          <Typography.Text strong>Font size</Typography.Text>
          <Typography.Text type="secondary">{fontSize}px</Typography.Text>
        </Flex>
        <Flex align="center" gap={8} style={{ marginTop: 4 }}>
          <Button size="small" onClick={decreaseFont} disabled={fontSize <= FONT_SIZE.min} aria-label="Decrease font size">
            A-
          </Button>
          <Slider
            style={{ flex: 1 }}
            min={FONT_SIZE.min}
            max={FONT_SIZE.max}
            value={fontSize}
            onChange={setFontSize}
            tooltip={{ formatter: (v) => `${v}px` }}
          />
          <Button size="small" onClick={increaseFont} disabled={fontSize >= FONT_SIZE.max} aria-label="Increase font size">
            A+
          </Button>
        </Flex>
        <Button type="link" size="small" onClick={resetFont} style={{ padding: 0 }}>
          Reset to default
        </Button>
      </div>
    </Flex>
  )
}

/** Quick dark-mode toggle + popover with theme mode and font size controls. */
export function ThemeControls() {
  const { isDark, toggleDark } = useTheme()

  return (
    <Flex gap={4}>
      <Tooltip title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
        <Button type="text" shape="circle" icon={isDark ? <SunOutlined /> : <MoonOutlined />} onClick={toggleDark} />
      </Tooltip>
      <Popover content={<DisplaySettings />} title={<><BgColorsOutlined /> Display settings</>} trigger="click" placement="bottomRight">
        <Tooltip title="Display settings">
          <Button type="text" shape="circle" icon={<FontSizeOutlined />} aria-label="Display settings" />
        </Tooltip>
      </Popover>
    </Flex>
  )
}
