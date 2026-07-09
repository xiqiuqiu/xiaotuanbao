import { useCallback } from 'react'
import { Spin, Tabs, Typography } from 'antd'
import type { TabsProps } from 'antd'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { DepartureStatus } from '@xiaotuanbao/shared'
import { getDeparture } from '@/services/departure.service'
import { useAuthStore } from '@/app/store/auth.store'
import { PaymentScheduleWorkspace } from '@/features/finance/components/PaymentScheduleWorkspace'
import { VerificationsWorkspace } from '@/features/finance/components/VerificationsWorkspace'
import { canMutateFinance } from '@/features/finance/utils/finance-permission'
import { DepartureHeader } from '../components/DepartureHeader'
import { DepartureOverview } from '../components/DepartureOverview'
import { SourceOrdersTab } from '../components/SourceOrdersTab'
import { ExecutionTab } from '../components/ExecutionTab'
import {
  DEPARTURE_DETAIL_TABS,
  isDepartureDetailTabKey,
  type DepartureDetailTabKey,
} from '../catalog'

const DEFAULT_TAB: DepartureDetailTabKey = 'overview'

export function DepartureDetailPage() {
  const { departureId } = useParams({ strict: false })
  const search = useSearch({ strict: false })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const menuKeys = useAuthStore((state) => state.menuKeys)

  const activeTab = isDepartureDetailTabKey(search.tab) ? search.tab : DEFAULT_TAB

  const { data: departure, isLoading, isError } = useQuery({
    queryKey: ['departure', departureId],
    queryFn: () => getDeparture(departureId!),
    enabled: Boolean(departureId),
  })

  const handleTabChange = (key: string) => {
    if (!departureId) {
      return
    }

    navigate({
      to: '/departure/$departureId',
      params: { departureId },
      search: {
        tab: key as DepartureDetailTabKey,
        ...(search.segmentId ? { segmentId: search.segmentId } : {}),
      },
    })
  }

  const clearFinanceHighlight = useCallback(() => {
    if (
      !departureId ||
      (!search.highlightSourceOrderId && !search.highlightSegmentResourceId)
    ) {
      return
    }

    navigate({
      to: '/departure/$departureId',
      params: { departureId },
      search: {
        tab: activeTab,
        ...(search.segmentId ? { segmentId: search.segmentId } : {}),
      },
      replace: true,
    })
  }, [
    activeTab,
    departureId,
    navigate,
    search.highlightSegmentResourceId,
    search.highlightSourceOrderId,
    search.segmentId,
  ])

  const handleUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ['departure', departureId] })
    queryClient.invalidateQueries({ queryKey: ['departures'] })
  }

  if (!departureId) {
    return (
      <div>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          发团不存在
        </Typography.Title>
        <Link to="/departure">返回发团列表</Link>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin />
      </div>
    )
  }

  if (isError || !departure) {
    return (
      <div>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          发团不存在
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          该发团可能已被删除或您无权访问。
        </Typography.Paragraph>
        <Link to="/departure">返回发团列表</Link>
      </div>
    )
  }

  const readOnly = departure.status === DepartureStatus.CLOSED
  const amountReadOnly =
    departure.status === DepartureStatus.SETTLED ||
    departure.status === DepartureStatus.CLOSED
  const financeReadOnly = readOnly || !canMutateFinance(menuKeys)

  const tabItems: NonNullable<TabsProps['items']> = DEPARTURE_DETAIL_TABS.map((tab) => {
    if (tab.key === 'overview') {
      return {
        key: tab.key,
        label: tab.label,
        children: <DepartureOverview departure={departure} />,
      }
    }

    if (tab.key === 'sourceOrders') {
      return {
        key: tab.key,
        label: tab.label,
        children: <SourceOrdersTab departure={departure} readOnly={readOnly} amountReadOnly={amountReadOnly} />,
      }
    }

    if (tab.key === 'execution') {
      return {
        key: tab.key,
        label: tab.label,
        children: (
          <ExecutionTab
            departure={departure}
            segmentId={search.segmentId}
            readOnly={readOnly}
            amountReadOnly={amountReadOnly}
          />
        ),
      }
    }

    if (tab.key === 'receivables') {
      return {
        key: tab.key,
        label: tab.label,
        children: (
          <PaymentScheduleWorkspace
            scope="departure"
            direction="receivable"
            departureId={departure.id}
            readOnly={financeReadOnly}
            highlightSourceOrderId={search.highlightSourceOrderId}
            onHighlightConsumed={clearFinanceHighlight}
          />
        ),
      }
    }

    if (tab.key === 'payables') {
      return {
        key: tab.key,
        label: tab.label,
        children: (
          <PaymentScheduleWorkspace
            scope="departure"
            direction="payable"
            departureId={departure.id}
            readOnly={financeReadOnly}
            highlightSegmentResourceId={search.highlightSegmentResourceId}
            onHighlightConsumed={clearFinanceHighlight}
          />
        ),
      }
    }

    return {
      key: tab.key,
      label: tab.label,
      children: (
        <VerificationsWorkspace
          scope="departure"
          departureId={departure.id}
          readOnly={financeReadOnly}
        />
      ),
    }
  })

  return (
    <div>
      <DepartureHeader departure={departure} onUpdated={handleUpdated} />

      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={tabItems}
        destroyOnHidden
      />
    </div>
  )
}
