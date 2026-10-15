// Stacked progress bar of a test run: passed / failed / blocked / skipped / untested.
// Status colours carry state, so every segment also has a text label (legend + tooltip) — never colour alone.
import { Flex, Tooltip, Typography, theme } from 'antd'
import type { RunSummary } from '../../../types/qa'
import { RESULT_LABELS, SUMMARY_ORDER } from './qaMeta'

export function RunProgress({ summary, showLegend = true, height = 8 }: { summary: RunSummary; showLegend?: boolean; height?: number }) {
  const { token } = theme.useToken()
  const colors: Record<(typeof SUMMARY_ORDER)[number], string> = {
    passed: token.colorSuccess,
    failed: token.colorError,
    blocked: token.colorWarning,
    skipped: token.colorTextTertiary,
    untested: token.colorFillSecondary, // the empty track
  }
  const parts = SUMMARY_ORDER.filter((k) => summary[k] > 0)

  return (
    <div style={{ minWidth: 140 }}>
      {/* 2px surface gap between segments, rounded ends */}
      <Flex gap={2} style={{ height, borderRadius: height / 2, overflow: 'hidden', background: token.colorFillQuaternary }} role="img" aria-label={parts.map((k) => `${summary[k]} ${k}`).join(', ')}>
        {parts.map((k) => (
          <Tooltip key={k} title={`${RESULT_LABELS[k]}: ${summary[k]}`}>
            <div style={{ flex: summary[k], background: colors[k], minWidth: 3 }} />
          </Tooltip>
        ))}
      </Flex>
      {showLegend && (
        <Flex gap={10} wrap style={{ marginTop: 4 }}>
          {parts.map((k) => (
            <Flex key={k} align="center" gap={4}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: colors[k], display: 'inline-block' }} />
              <Typography.Text type="secondary" style={{ fontSize: '0.8em' }}>
                {summary[k]} {RESULT_LABELS[k].toLowerCase()}
              </Typography.Text>
            </Flex>
          ))}
        </Flex>
      )}
    </div>
  )
}
