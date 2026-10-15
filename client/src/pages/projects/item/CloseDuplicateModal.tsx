// "Close as duplicate of…" — pick the original (search by key or text), the server links and closes.
import { App, Modal, Select, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { getErrorMessage } from '../../../lib/api'
import { workItemsService } from '../../../services/projects.service'
import type { WorkItemDetail, WorkItemSummary } from '../../../types/projects'

export function CloseDuplicateModal({ item, onClose, onClosed }: { item: WorkItemDetail; onClose: () => void; onClosed: (item: WorkItemDetail) => void }) {
  const { message } = App.useApp()
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<WorkItemSummary[]>([])
  const [target, setTarget] = useState<string>()
  const [busy, setBusy] = useState(false)

  // start with the most similar items, then whatever the user searches for
  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      const request = search.trim() ? workItemsService.search(search.trim(), item.id) : workItemsService.similar(item.project.key, item.title, item.id)
      request.then((r) => alive && setOptions(r), () => alive && setOptions([]))
    }, 250)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [search, item.id, item.project.key, item.title])

  const submit = async () => {
    if (!target) return
    setBusy(true)
    try {
      const updated = await workItemsService.closeDuplicate(item.id, target)
      message.success(`${item.key} closed as a duplicate of ${target}`)
      onClosed(updated)
      onClose()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open title={`Close ${item.key} as a duplicate`} okText="Close as duplicate" okButtonProps={{ disabled: !target }} confirmLoading={busy} onOk={submit} onCancel={onClose}>
      <Typography.Paragraph type="secondary">
        The items get a “duplicates” link, this one is closed with resolution <b>Duplicate</b>, and its watchers start watching the original.
      </Typography.Paragraph>
      <Select
        showSearch
        filterOption={false}
        onSearch={setSearch}
        value={target}
        onChange={setTarget}
        placeholder="Original item: key (TF-12) or words from its title"
        style={{ width: '100%' }}
        options={options.map((o) => ({ value: o.key, label: `${o.key} · ${o.title} (${o.status.name})` }))}
      />
    </Modal>
  )
}
