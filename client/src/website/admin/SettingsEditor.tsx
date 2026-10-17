// Header, footer and announcement bar of the website (draft → publish, like the pages).
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, App, Badge, Button, Card, Col, Flex, Form, Input, Popconfirm, Row, Select, Skeleton, Space, Switch, Typography } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { websiteAdminApi } from '../api'
import type { SettingsDraft, SiteSettings } from '../types'
import { SAFE_HREF } from '../websiteMeta'
import { cleanContent } from './formMeta'
import { MediaField } from './MediaLibrary'

const hrefRule = { pattern: SAFE_HREF, message: 'Use /a-page, https://… or mailto:…' }

export function SettingsEditor({ onChanged }: { onChanged: () => void }) {
  const { message } = App.useApp()
  const [form] = Form.useForm<SiteSettings>()
  const loaded = useFetch(useCallback(() => websiteAdminApi.settings(), []))
  const [state, setState] = useState<SettingsDraft | null>(null)
  const current = state ?? loaded.data
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (loaded.data) form.setFieldsValue(loaded.data.draft)
  }, [loaded.data, form])

  if (loaded.error) return <Alert type="error" showIcon title={loaded.error} />
  if (!current) return <Skeleton active />

  const save = async () => {
    const v = await form.validateFields()
    setSaving(true)
    try {
      setState(await websiteAdminApi.saveSettings(cleanContent(v) as SiteSettings))
      message.success('Saved to the draft — publish to make it live')
      onChanged()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }
  const publish = async () => {
    try {
      setState(await websiteAdminApi.publishSettings())
      message.success('Header & footer published')
      onChanged()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  return (
    <Card>
      <Flex justify="space-between" align="center" gap={12} wrap style={{ marginBottom: 16 }}>
        {current.hasChanges ? <Badge status="warning" text="Unpublished changes" /> : <Badge status="success" text="Published" />}
        <Space>
          <Button onClick={save} loading={saving}>Save draft</Button>
          <Popconfirm title="Publish header & footer?" onConfirm={publish} disabled={!current.hasChanges}>
            <Button type="primary" disabled={!current.hasChanges}>Publish</Button>
          </Popconfirm>
        </Space>
      </Flex>
      <Form form={form} layout="vertical" initialValues={current.draft} requiredMark="optional">
        <Typography.Title level={5}>Brand</Typography.Title>
        <Row gutter={16}>
          <Col xs={24} md={10}><Form.Item name="brandName" label="Name" rules={[{ required: true }]}><Input maxLength={40} /></Form.Item></Col>
          <Col xs={24} md={14}><Form.Item name="logoMediaId" label="Logo"><MediaField emptyLabel="Initials badge" /></Form.Item></Col>
        </Row>

        <Typography.Title level={5}>Announcement bar</Typography.Title>
        <Row gutter={16}>
          <Col xs={6} md={4}><Form.Item name={['announcement', 'enabled']} label="Show" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col xs={18} md={12}><Form.Item name={['announcement', 'text']} label="Text"><Input maxLength={160} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name={['announcement', 'href']} label="Link" rules={[hrefRule]}><Input placeholder="/features" /></Form.Item></Col>
        </Row>

        <Typography.Title level={5}>Header</Typography.Title>
        <Row gutter={16}>
          <Col xs={24} md={8}><Form.Item name={['header', 'loginLabel']} label="Log-in button" rules={[{ required: true }]}><Input maxLength={30} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name={['header', 'ctaLabel']} label="Main button" rules={[{ required: true }]}><Input maxLength={30} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name={['header', 'ctaHref']} label="Main button link" rules={[{ required: true }, hrefRule]}><Input /></Form.Item></Col>
        </Row>
        <Typography.Paragraph type="secondary" style={{ fontSize: '0.85em' }}>
          The menu shows the pages with “In the top menu” switched on (each page's settings).
        </Typography.Paragraph>

        <Typography.Title level={5}>Footer</Typography.Title>
        <Form.Item name={['footer', 'text']} label="Text under the name"><Input.TextArea maxLength={300} autoSize={{ minRows: 2 }} /></Form.Item>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Typography.Text strong>Footer main button</Typography.Text>
            <Row gutter={8} style={{ marginTop: 8 }}>
              <Col span={10}><Form.Item name={['footer', 'primaryCta', 'label']}><Input placeholder="Start free" maxLength={40} /></Form.Item></Col>
              <Col span={14}><Form.Item name={['footer', 'primaryCta', 'href']} rules={[hrefRule]}><Input placeholder="/register" /></Form.Item></Col>
            </Row>
          </Col>
          <Col xs={24} md={12}>
            <Typography.Text strong>Footer second button</Typography.Text>
            <Row gutter={8} style={{ marginTop: 8 }}>
              <Col span={10}><Form.Item name={['footer', 'secondaryCta', 'label']}><Input placeholder="Book a demo" maxLength={40} /></Form.Item></Col>
              <Col span={14}><Form.Item name={['footer', 'secondaryCta', 'href']} rules={[hrefRule]}><Input placeholder="/contact?type=demo" /></Form.Item></Col>
            </Row>
          </Col>
        </Row>
        <Form.List name={['footer', 'columns']}>
          {(cols, colOps) => (
            <Flex vertical gap={12} style={{ marginBottom: 12 }}>
              {cols.map((col) => (
                <Card
                  key={col.key}
                  size="small"
                  title={<Form.Item name={[col.name, 'title']} noStyle rules={[{ required: true }]}><Input placeholder="Column title" maxLength={40} style={{ maxWidth: 260 }} /></Form.Item>}
                  extra={<Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => colOps.remove(col.name)} aria-label="Remove column" />}
                >
                  <Form.List name={[col.name, 'links']}>
                    {(links, linkOps) => (
                      <>
                        {links.map((l) => (
                          <Row key={l.key} gutter={8} align="middle">
                            <Col span={9}><Form.Item name={[l.name, 'label']} rules={[{ required: true }]}><Input placeholder="Label" maxLength={40} /></Form.Item></Col>
                            <Col span={13}><Form.Item name={[l.name, 'href']} rules={[{ required: true }, hrefRule]}><Input placeholder="/pricing" /></Form.Item></Col>
                            <Col span={2}><Button type="text" danger icon={<DeleteOutlined />} onClick={() => linkOps.remove(l.name)} style={{ marginBottom: 24 }} aria-label="Remove link" /></Col>
                          </Row>
                        ))}
                        <Button size="small" icon={<PlusOutlined />} onClick={() => linkOps.add({ label: '', href: '/' })} disabled={links.length >= 10}>Add link</Button>
                      </>
                    )}
                  </Form.List>
                </Card>
              ))}
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => colOps.add({ title: 'New column', links: [] })} disabled={cols.length >= 5}>
                Add footer column
              </Button>
            </Flex>
          )}
        </Form.List>
        <Form.Item name={['footer', 'copyright']} label="Copyright line" tooltip="{year} becomes the current year"><Input maxLength={160} /></Form.Item>

        <Typography.Title level={5}>Social profiles</Typography.Title>
        <Form.List name="social">
          {(rows, ops) => (
            <>
              {rows.map((r) => (
                <Row key={r.key} gutter={8} align="middle">
                  <Col span={8}>
                    <Form.Item name={[r.name, 'network']} rules={[{ required: true }]}>
                      <Select options={['linkedin', 'x', 'github', 'youtube', 'facebook', 'instagram'].map((n) => ({ value: n, label: n === 'x' ? 'X (Twitter)' : n[0]!.toUpperCase() + n.slice(1) }))} />
                    </Form.Item>
                  </Col>
                  <Col span={14}><Form.Item name={[r.name, 'href']} rules={[{ required: true }, hrefRule]}><Input placeholder="https://www.linkedin.com/company/…" /></Form.Item></Col>
                  <Col span={2}><Button type="text" danger icon={<DeleteOutlined />} onClick={() => ops.remove(r.name)} style={{ marginBottom: 24 }} aria-label="Remove profile" /></Col>
                </Row>
              ))}
              <Button size="small" icon={<PlusOutlined />} onClick={() => ops.add({ network: 'linkedin', href: 'https://' })} disabled={rows.length >= 6}>Add social profile</Button>
            </>
          )}
        </Form.List>
      </Form>
    </Card>
  )
}
