import type { ReactNode } from 'react'
import { Typography } from 'antd'

/**
 * 窄列/限宽文本：超出省略，悬停用 Tooltip 展示全文（仅实际溢出时出现）。
 * 避免仅靠 CSS 截断导致内容不可观测。
 */
export function EllipsisTooltipText({
  children,
  empty = '-',
}: {
  children: ReactNode
  /** 空值占位；传空字符串则保留空白（如确认单游客代表）。 */
  empty?: string
}) {
  const content =
    children === null || children === undefined || children === '' ? empty : children

  return (
    <Typography.Text
      ellipsis={{ tooltip: content }}
      // Inherit parent color so TableNameLink (and other link wrappers) stay blue.
      style={{ width: '100%', margin: 0, color: 'inherit' }}
    >
      {content}
    </Typography.Text>
  )
}
