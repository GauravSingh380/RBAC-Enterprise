// "Views" dropdown: apply a saved filter set, save the current one, delete your own.
import { DeleteOutlined, DownOutlined, EyeOutlined, SaveOutlined, TeamOutlined } from '@ant-design/icons'
import { App, Button, Checkbox, Dropdown, Form, Input, Modal, Space, Tooltip, Typography, type MenuProps } from 'antd'
import { useCallback, useState } from 'react'
import { useFetch } from '../../../hooks/useFetch'
import { getErrorMessage } from '../../../lib/api'
import { savedViewsService } from '../../../services/projects.service'
import type { ProjectDetail, SavedView } from '../../../types/projects'
import { sameFilters, type ItemFilters } from './useItemFilters'

export function SavedViewsMenu({ project, viewType, filters }: { project: ProjectDetail; viewType: 'list' | 'board'; filters: ItemFilters }) {
  const { message, modal } = App.useApp()
  const views = useFetch(useCallback(() => savedViewsService.list(project.key), [project.key]))
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ name: string; isShared: boolean }>()

  const mine = (views.data ?? []).filter((v) => v.viewType === viewType)
  const current = mine.find((v) => sameFilters(v.filters, filters.snapshot))

  const remove = (view: SavedView) =>
    modal.confirm({
      title: `Delete the view "${view.name}"?`,
      okButtonProps: { danger: true },
      okText: 'Delete',
      onOk: async () => {
        await savedViewsService.remove(project.key, view.id)
        views.reload()
      },
    })

  const row = (v: SavedView) => (
    <Space style={{ width: '100%', justifyContent: 'space-between', minWidth: 220 }}>
      <span>
        {v.isShared ? (
          <Tooltip title={`Shared by ${v.owner.name}`}>
            <TeamOutlined style={{ marginRight: 8 }} />
          </Tooltip>
        ) : (
          <EyeOutlined style={{ marginRight: 8, opacity: 0.5 }} />
        )}
        {v.name}
      </span>
      {v.canEdit && (
        <DeleteOutlined
          aria-label={`Delete ${v.name}`}
          onClick={(e) => {
            e.stopPropagation()
            remove(v)
          }}
        />
      )}
    </Space>
  )

  const items: MenuProps['items'] = [
    ...(mine.length
      ? mine.map((v) => ({ key: String(v.id), label: row(v), onClick: () => filters.replaceAll(v.filters) }))
      : [{ key: 'empty', disabled: true, label: <Typography.Text type="secondary">No saved views yet</Typography.Text> }]),
    { type: 'divider' as const },
    { key: 'save', icon: <SaveOutlined />, label: 'Save current filters as a view…', onClick: () => setSaving(true) },
  ]

  const save = async () => {
    const values = await form.validateFields()
    try {
      await savedViewsService.create(project.key, { name: values.name, viewType, filters: filters.snapshot, isShared: values.isShared })
      message.success('View saved')
      setSaving(false)
      form.resetFields()
      views.reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  return (
    <>
      <Dropdown menu={{ items }} trigger={['click']}>
        <Button>
          {current ? current.name : 'Views'} <DownOutlined />
        </Button>
      </Dropdown>
      <Modal title="Save view" open={saving} onOk={save} okText="Save" onCancel={() => setSaving(false)} destroyOnHidden>
        <Typography.Paragraph type="secondary">Saves the current filters{viewType === 'board' ? ' of the board' : ''} under a name.</Typography.Paragraph>
        <Form form={form} layout="vertical" initialValues={{ isShared: false }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, max: 100 }]}>
            <Input autoFocus placeholder="e.g. My open bugs" onPressEnter={save} />
          </Form.Item>
          <Form.Item name="isShared" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Checkbox disabled={!project.canEdit}>Share with everyone in this project</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
