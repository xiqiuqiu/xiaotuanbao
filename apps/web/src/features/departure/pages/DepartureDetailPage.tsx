import { useCallback, useEffect, useRef } from 'react'
import { Tabs, Typography } from 'antd'
import type { TabsProps } from 'antd'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import {
  DepartureStatus,
  TransactionDirection,
} from '@xiaotuanbao/shared'
import { getDeparture } from '@/services/departure.service'
import { useAuthStore } from '@/app/store/auth.store'
import { DepartureDetailShellSkeleton } from '@/components/DepartureDetailShellSkeleton'
import { StaleDataAlert } from '@/components/StaleDataAlert'
import { PaymentScheduleWorkspace } from '@/features/finance/components/PaymentScheduleWorkspace'
import { TransactionsWorkspace } from '@/features/finance/components/TransactionsWorkspace'
import { VerificationsWorkspace } from '@/features/finance/components/VerificationsWorkspace'
import { canMutateFinance } from '@/features/finance/utils/finance-permission'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import { DepartureHeader } from '../components/DepartureHeader'
import { DepartureOverview } from '../components/DepartureOverview'
import { SourceOrdersTab } from '../components/SourceOrdersTab'
import { ExecutionTab } from '../components/ExecutionTab'
import {
  DEPARTURE_DETAIL_TABS,
  isDepartureDetailTabKey,
  type DepartureDetailTabKey,
} from '../catalog'
import { invalidateDepartureDetailQueries } from '../utils/invalidate-departure-detail-queries'

const DEFAULT_TAB: DepartureDetailTabKey = 'overview'

function resolveTransactionDirection(
  value: string | undefined,
): TransactionDirection | undefined {
  if (!value) {
    return undefined
  }
  return Object.values(TransactionDirection).includes(value as TransactionDirection)
    ? (value as TransactionDirection)
    : undefined
}

export function DepartureDetailPage() {
  const { departureId } = useParams({ strict: false })
  const search = useSearch({ strict: false })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const menuKeys = useAuthStore((state) => state.menuKeys)
  const animatedOverviewDepartureIds = useRef(new Set<string>())

  const activeTab = isDepartureDetailTabKey(search.tab) ? search.tab : DEFAULT_TAB

  const {
    data: departure,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['departure', departureId],
    queryFn: () => getDeparture(departureId!),
    enabled: Boolean(departureId),
    ...operationalQueryOptions(),
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
        ...(search.counterpartyKeyword
          ? { counterpartyKeyword: search.counterpartyKeyword }
          : {}),
      },
      replace: true,
    })
  }, [
    activeTab,
    departureId,
    navigate,
    search.counterpartyKeyword,
    search.highlightSegmentResourceId,
    search.highlightSourceOrderId,
    search.segmentId,
  ])

  const handleUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ['departure', departureId] })
    queryClient.invalidateQueries({ queryKey: ['departures'] })
  }

  const handleRefreshDetail = useCallback(() => {
    if (!departureId) {
      return
    }
    invalidateDepartureDetailQueries(queryClient, departureId)
    void refetch()
  }, [departureId, queryClient, refetch])

  const currentDepartureId = departure?.id
  useEffect(() => {
    if (activeTab === 'overview' && currentDepartureId) {
      animatedOverviewDepartureIds.current.add(currentDepartureId)
    }
  }, [activeTab, currentDepartureId])

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

  if (!departure) {
    if (isLoading) {
      return <DepartureDetailShellSkeleton activeTab={activeTab} />
    }
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
  const counterpartyKeyword =
    typeof search.counterpartyKeyword === 'string' ? search.counterpartyKeyword : undefined

  const tabItems: NonNullable<TabsProps['items']> = DEPARTURE_DETAIL_TABS.map((tab) => {
    if (tab.key === 'overview') {
      return {
        key: tab.key,
        label: tab.label,
        children: (
          <DepartureOverview
            departure={departure}
            animateEnter={!animatedOverviewDepartureIds.current.has(departure.id)}
          />
        ),
      }
    }

    if (tab.key === 'sourceOrders') {
      return {
        key: tab.key,
        label: tab.label,
        children: (
          <SourceOrdersTab
            departure={departure}
            readOnly={readOnly}
            amountReadOnly={amountReadOnly}
          />
        ),
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
            initialCounterpartyKeyword={counterpartyKeyword}
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
            initialCounterpartyKeyword={counterpartyKeyword}
            onHighlightConsumed={clearFinanceHighlight}
          />
        ),
      }
    }

    if (tab.key === 'transactions') {
      return {
        key: tab.key,
        label: tab.label,
        children: (
          <TransactionsWorkspace
            scope="departure"
            departureId={departure.id}
            readOnly={financeReadOnly}
            initialDirection={resolveTransactionDirection(search.direction)}
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
          deepLinkSearch={{
            transactionNo: search.transactionNo,
            scheduleNo: search.scheduleNo,
          }}
        />
      ),
    }
  })

  return (
    <div>
      <StaleDataAlert
        isFetching={isFetching}
        isError={isError}
        hasData={Boolean(departure)}
        onRefresh={handleRefreshDetail}
      />
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
