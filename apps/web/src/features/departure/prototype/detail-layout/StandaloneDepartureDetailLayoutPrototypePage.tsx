/**
 * PROTOTYPE — standalone page (no auth). Header mirrors production DepartureHeaderCard.
 */
import { useState } from 'react'
import { Typography, message } from 'antd'
import type { MenuProps } from 'antd'
import { DepartureStatus, DepartureType, type DepartureDetail } from '@xiaotuanbao/shared'
import { DepartureHeaderCard } from '../../components/DepartureHeaderCard'
import { DepartureDetailLayoutPrototypeHost } from './DepartureDetailLayoutPrototypeHost'

const MOCK_DEPARTURE = {
  id: 'proto-dep-1',
  departureNo: 'XTB2026070011',
  name: '2026年8月1号 天吐喀伊',
  routeName: 'A线：天吐喀伊',
  departureType: DepartureType.INDEPENDENT,
  startDate: '2026-07-28',
  endDate: '2026-08-06',
  totalGuests: 2,
  ownerName: '演示管理员',
  departureProgress: 'in_progress',
  status: DepartureStatus.EDITING,
  driverSupplierId: 'proto-driver-1',
  driverSupplierName: '阿力木',
  guideSupplierId: 'proto-guide-1',
  guideSupplierName: '古丽',
  vehiclePlate: '新A·D20601',
  createdAt: '2026-07-28T04:48:00.000Z',
  updatedAt: '2026-07-29T04:50:00.000Z',
  archiveHistory: [],
  settlementHistory: [],
} as unknown as DepartureDetail

/** Prototype-only crew phone until departure detail exposes a dedicated field. */
const MOCK_CREW_PHONE = '13800138000'

export function StandaloneDepartureDetailLayoutPrototypePage() {
  const [historyOpen, setHistoryOpen] = useState(false)

  if (import.meta.env.PROD) {
    return (
      <div style={{ padding: 48 }}>
        <Typography.Title level={4}>原型仅开发环境可用</Typography.Title>
      </div>
    )
  }

  const stubAction = (label: string) => () => {
    message.info(`原型占位：${label}`)
  }

  const menuItems: NonNullable<MenuProps['items']> = [
    {
      key: 'operations-sheet',
      label: '发团运营表',
      onClick: stubAction('发团运营表'),
    },
    {
      key: 'save-route',
      label: '保存为常用路线',
      onClick: stubAction('保存为常用路线'),
    },
    {
      key: 'pending-settlement',
      label: '切换为待结算',
      onClick: stubAction('切换为待结算'),
    },
    {
      key: 'close',
      label: '关闭发团',
      danger: true,
      onClick: stubAction('关闭发团'),
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F5', padding: 24 }}>
      <DepartureHeaderCard
        departure={MOCK_DEPARTURE}
        menuItems={menuItems}
        primaryAction={{ label: '编辑发团', onClick: stubAction('编辑发团') }}
        historyOpen={historyOpen}
        onHistoryOpenChange={setHistoryOpen}
        crewContactPhone={MOCK_CREW_PHONE}
      />

      <DepartureDetailLayoutPrototypeHost
        departure={MOCK_DEPARTURE}
        standalonePath="/prototype/departure-detail-layout"
      />
    </div>
  )
}
