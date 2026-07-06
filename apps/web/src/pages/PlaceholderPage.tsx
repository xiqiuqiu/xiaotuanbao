import { Typography } from 'antd'

interface PlaceholderPageProps {
  title: string
  description?: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div>
      <Typography.Title level={4}>{title}</Typography.Title>
      <Typography.Paragraph type="secondary">
        {description ?? '该模块将在后续迭代中实现。'}
      </Typography.Paragraph>
    </div>
  )
}
