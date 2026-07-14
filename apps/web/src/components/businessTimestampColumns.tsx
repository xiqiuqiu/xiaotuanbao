import type { ColumnsType } from 'antd/es/table'
import { formatBusinessDateTime } from '@/utils/formatBusinessDateTime'

type BusinessTimestamps = {
  createdAt: string
  updatedAt: string
}

export function buildBusinessTimestampColumns<T extends BusinessTimestamps>(): ColumnsType<T> {
  return [
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 150,
      render: (value: string) => (
        <span style={{ whiteSpace: 'nowrap' }}>{formatBusinessDateTime(value)}</span>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 150,
      render: (value: string) => (
        <span style={{ whiteSpace: 'nowrap' }}>{formatBusinessDateTime(value)}</span>
      ),
    },
  ]
}
