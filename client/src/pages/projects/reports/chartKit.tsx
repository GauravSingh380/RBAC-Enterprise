// Chart card with a Chart / Table switch (accessibility, exact numbers). Colours: chartTheme.ts
import { Card, Segmented, Table, type TableColumnsType } from 'antd'
import { useState, type ReactNode } from 'react'

/** A card holding a chart with a Chart / Table switch. */
export function ChartCard<T extends object>({
  title,
  extra,
  chart,
  rows,
  columns,
  rowKey,
}: {
  title: ReactNode
  extra?: ReactNode
  chart: ReactNode
  rows: T[]
  columns: TableColumnsType<T>
  rowKey: keyof T & string
}) {
  const [mode, setMode] = useState<'chart' | 'table'>('chart')
  return (
    <Card
      title={title}
      extra={
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          {extra}
          <Segmented size="small" value={mode} onChange={(v) => setMode(v as 'chart' | 'table')} options={[{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' }]} />
        </span>
      }
    >
      {mode === 'chart' ? chart : <Table<T> size="small" rowKey={rowKey} dataSource={rows} columns={columns} pagination={false} scroll={{ y: 320 }} />}
    </Card>
  )
}
