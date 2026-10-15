// Checklist of a work item: tick steps, add with Enter, drag to reorder, edit / delete.
import { CheckSquareOutlined, DeleteOutlined, HolderOutlined } from '@ant-design/icons'
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { App, Button, Checkbox, Flex, Input, Progress, Tooltip, Typography, theme } from 'antd'
import { useState } from 'react'
import { getErrorMessage } from '../../../lib/api'
import { checklistService } from '../../../services/workspace.service'
import type { ChecklistItem, WorkItemDetail } from '../../../types/projects'

export function ItemChecklist({ item, canEdit, onChanged }: { item: WorkItemDetail; canEdit: boolean; onChanged: (list: ChecklistItem[]) => void }) {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const list = item.checklistItems
  const done = list.filter((c) => c.done).length
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const run = async (fn: () => Promise<ChecklistItem[]>) => {
    try {
      onChanged(await fn())
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const add = async () => {
    const text = draft.trim()
    if (!text) return
    setAdding(true)
    await run(() => checklistService.add(item.id, text))
    setDraft('')
    setAdding(false)
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = list.findIndex((c) => c.id === active.id)
    const to = list.findIndex((c) => c.id === over.id)
    const next = arrayMove(list, from, to)
    onChanged(next) // optimistic
    void run(() => checklistService.reorder(item.id, next.map((c) => c.id)))
  }

  if (!list.length && !canEdit) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <Flex align="center" gap={12} style={{ marginBottom: 8 }}>
        <Typography.Text strong>
          <CheckSquareOutlined /> Checklist
        </Typography.Text>
        {list.length > 0 && (
          <>
            <Progress percent={Math.round((done / list.length) * 100)} size="small" showInfo={false} style={{ flex: 1, margin: 0, maxWidth: 240 }} />
            <Typography.Text type="secondary">
              {done}/{list.length}
            </Typography.Text>
          </>
        )}
      </Flex>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={list.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <Flex vertical gap={2}>
            {list.map((c) => (
              <Step
                key={c.id}
                step={c}
                canEdit={canEdit}
                hoverBg={token.colorFillTertiary}
                onToggle={(v) => run(() => checklistService.update(item.id, c.id, { done: v }))}
                onRename={(text) => run(() => checklistService.update(item.id, c.id, { text }))}
                onDelete={() => run(() => checklistService.remove(item.id, c.id))}
              />
            ))}
          </Flex>
        </SortableContext>
      </DndContext>
      {canEdit && (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={add}
          disabled={adding}
          maxLength={500}
          placeholder={list.length ? 'Add a step and press Enter' : 'Add a checklist: type a step and press Enter'}
          variant="borderless"
          style={{ paddingInline: 30, marginTop: 2 }}
          aria-label="New checklist step"
        />
      )}
    </div>
  )
}

function Step({
  step, canEdit, hoverBg, onToggle, onRename, onDelete,
}: {
  step: ChecklistItem
  canEdit: boolean
  hoverBg: string
  onToggle: (done: boolean) => void
  onRename: (text: string) => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id, disabled: !canEdit })
  const [hover, setHover] = useState(false)
  return (
    <Flex
      ref={setNodeRef}
      align="center"
      gap={8}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        padding: '3px 4px',
        borderRadius: 6,
        background: hover || isDragging ? hoverBg : undefined,
      }}
    >
      {canEdit ? (
        <span {...attributes} {...listeners} style={{ cursor: 'grab', visibility: hover ? 'visible' : 'hidden' }} aria-label="Drag to reorder">
          <HolderOutlined />
        </span>
      ) : (
        <span style={{ width: 14 }} />
      )}
      <Checkbox checked={step.done} disabled={!canEdit} onChange={(e) => onToggle(e.target.checked)} aria-label={step.text} />
      <Typography.Text
        delete={step.done}
        type={step.done ? 'secondary' : undefined}
        style={{ flex: 1 }}
        editable={canEdit ? { onChange: (v) => v.trim() && v !== step.text && onRename(v.trim()), triggerType: ['text'], maxLength: 500 } : false}
      >
        {step.text}
      </Typography.Text>
      {step.done && step.doneBy && (
        <Tooltip title={step.doneAt ? new Date(step.doneAt).toLocaleString() : undefined}>
          <Typography.Text type="secondary" style={{ fontSize: '0.8em' }}>
            {step.doneBy.name}
          </Typography.Text>
        </Tooltip>
      )}
      {canEdit && hover && <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={onDelete} aria-label={`Delete step ${step.text}`} />}
    </Flex>
  )
}
