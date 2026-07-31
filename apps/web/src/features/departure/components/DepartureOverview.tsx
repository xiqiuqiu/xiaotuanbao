import { Space } from 'antd'
import type { DepartureDetail } from '@/types/api'
import { DepartureOverviewPrototypeHost } from '../prototype/overview/DepartureOverviewPrototypeHost'

interface DepartureOverviewProps {
  departure: DepartureDetail
  animateEnter: boolean
  /** 保留入参以兼容详情页签名；概览已无台账录入区。 */
  mutationLocked: boolean
}

/**
 * PROTOTYPE: DEV 下挂载概览 A/B/C 切换；生产构建仍只走正式 StatsCards（host 内 prod 分支）。
 */
export function DepartureOverview({
  departure,
  animateEnter,
  mutationLocked: _mutationLocked,
}: DepartureOverviewProps) {
  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <DepartureOverviewPrototypeHost departure={departure} animateEnter={animateEnter} />
    </Space>
  )
}
