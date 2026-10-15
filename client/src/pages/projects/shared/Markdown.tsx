// Markdown display + a simple Write / Preview editor.
// react-markdown never renders raw HTML, so user content cannot inject scripts.
import { Input, Segmented, Typography, theme } from 'antd'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Link } from 'react-router-dom'

/** "@[Ravi](user:12)" → "[@Ravi](#user-12)" so mentions render as highlighted links. */
const withMentions = (text: string) => text.replace(/@\[([^\]]{1,100})\]\(user:(\d+)\)/g, '[@$1](#user-$2)')

export function MarkdownView({ value, empty = 'Nothing here yet' }: { value: string | null | undefined; empty?: string }) {
  const { token } = theme.useToken()
  if (!value?.trim()) return <Typography.Text type="secondary">{empty}</Typography.Text>
  return (
    <div className="markdown-body" style={{ lineHeight: 1.65, wordBreak: 'break-word' }}>
      <ReactMarkdown
        components={{
          a: ({ href, children }) =>
            href?.startsWith('#user-') ? (
              <span style={{ background: token.colorPrimaryBg, color: token.colorPrimary, borderRadius: 4, padding: '0 4px', fontWeight: 500 }}>
                {children}
              </span>
            ) : href && /^\/(?!\/)/.test(href) ? (
              // a page of this app ("/leave", "/guide/leave"): stay in the tab
              <Link to={href}>{children}</Link>
            ) : (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            ),
          code: ({ children }) => (
            <code style={{ background: token.colorFillTertiary, borderRadius: 4, padding: '1px 5px' }}>{children}</code>
          ),
          pre: ({ children }) => (
            <pre style={{ background: token.colorFillTertiary, borderRadius: 8, padding: 12, overflowX: 'auto' }}>{children}</pre>
          ),
        }}
      >
        {withMentions(value)}
      </ReactMarkdown>
    </div>
  )
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 6,
  autoFocus,
}: {
  value?: string
  onChange?: (v: string) => void
  placeholder?: string
  rows?: number
  autoFocus?: boolean
}) {
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const { token } = theme.useToken()
  return (
    <div>
      <Segmented
        size="small"
        value={mode}
        onChange={(v) => setMode(v as 'write' | 'preview')}
        options={[
          { value: 'write', label: 'Write' },
          { value: 'preview', label: 'Preview' },
        ]}
        style={{ marginBottom: 8 }}
      />
      {mode === 'write' ? (
        <Input.TextArea
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder ?? 'Markdown supported: **bold**, _italic_, `code`, - lists, [links](https://…)'}
          autoSize={{ minRows: rows, maxRows: 24 }}
          autoFocus={autoFocus}
        />
      ) : (
        <div style={{ minHeight: rows * 22, padding: 12, border: `1px solid ${token.colorBorder}`, borderRadius: token.borderRadius }}>
          <MarkdownView value={value} empty="Nothing to preview" />
        </div>
      )}
    </div>
  )
}
