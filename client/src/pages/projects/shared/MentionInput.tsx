// Comment box with @mentions. The user types "@Ra…" and picks a person; on submit
// "@Ravi Kumar" is converted to the stored token "@[Ravi Kumar](user:12)".
import { Mentions } from 'antd'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import type { PersonOption } from '../../../types/projects'

export interface MentionInputHandle {
  /** Text with mentions encoded as @[Name](user:id). */
  encode: (text: string) => string
  reset: () => void
}

interface Props {
  value: string
  onChange: (v: string) => void
  people: PersonOption[]
  placeholder?: string
  autoFocus?: boolean
  onSubmitShortcut?: () => void
}

export const MentionInput = forwardRef<MentionInputHandle, Props>(function MentionInput(
  { value, onChange, people, placeholder, autoFocus, onSubmitShortcut },
  ref,
) {
  const picked = useRef(new Map<string, number>())

  useImperativeHandle(ref, () => ({
    encode: (text: string) => {
      let out = text
      // longest names first so "Ravi Kumar" wins over "Ravi"
      for (const [name, id] of [...picked.current.entries()].sort((a, b) => b[0].length - a[0].length)) {
        out = out.split(`@${name}`).join(`@[${name}](user:${id})`)
      }
      return out
    },
    reset: () => picked.current.clear(),
  }))

  return (
    <Mentions
      value={value}
      onChange={onChange}
      autoSize={{ minRows: 3, maxRows: 12 }}
      placeholder={placeholder ?? 'Add a comment… type @ to mention someone. Markdown supported.'}
      autoFocus={autoFocus}
      split=" "
      onSelect={(option) => {
        const person = people.find((p) => p.name === option.value)
        if (person) picked.current.set(person.name, person.id)
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onSubmitShortcut?.()
      }}
      options={people.map((p) => ({ value: p.name, label: `${p.name} · ${p.email}` }))}
    />
  )
})
