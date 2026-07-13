import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

/**
 * 财务模块中查看关联发团详情时，在新标签页打开，避免返回落到发团列表而打断财务操作流。
 */
export function FinanceDepartureLink({
  departureId,
  children,
}: {
  departureId: string
  children: ReactNode
}) {
  return (
    <Link
      to="/departure/$departureId"
      params={{ departureId }}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </Link>
  )
}
