import { Empty } from 'antd'

interface DepartureTabPlaceholderProps {
  title: string
}

export function DepartureTabPlaceholder({ title }: DepartureTabPlaceholderProps) {
  return (
    <Empty
      description={`${title}功能将在后续迭代中实现`}
      style={{ padding: '48px 0' }}
    />
  )
}
