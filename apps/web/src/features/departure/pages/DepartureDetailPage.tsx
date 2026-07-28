import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { Button, Result, Tabs } from 'antd'
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
import { canEditDeparture } from '../utils/departure-permission'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import { ApiError } from '@/lib/request/client'
import { DepartureHeader } from '../components/DepartureHeader'
import { DepartureOverview } from '../components/DepartureOverview'
import { SourceOrdersTab } from '../components/SourceOrdersTab'
import { ExecutionTab } from '../components/ExecutionTab'
import {
  DEPARTURE_DETAIL_TABS,
  isDepartureDetailTabKey,
  isDepartureDetailTabVisible,
  type DepartureDetailTabKey,
} from '../catalog'
import { invalidateDepartureDetailQueries } from '../utils/invalidate-departure-detail-queries'
import styles from './DepartureDetailPage.module.css'

const DEFAULT_TAB: DepartureDetailTabKey = 'overview'

function wrapTabPane(children: ReactNode) {
  return <div className={styles.tabPaneEnter}>{children}</div>
}

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
  const actionKeys = useAuthStore((state) => state.actionKeys)
  const canEdit = canEditDeparture(actionKeys)
  const animatedOverviewDepartureIds = useRef(new Set<string>())

  const requestedTab = isDepartureDetailTabKey(search.tab) ? search.tab : DEFAULT_TAB
  const activeTab = isDepartureDetailTabVisible(requestedTab, menuKeys)
    ? requestedTab
    : DEFAULT_TAB

  const {
    data: departure,
    isLoading,
    isError,
    isFetching,
    error,
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
        ...(search.listReturn ? { listReturn: search.listReturn } : {}),
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
        ...(search.listReturn ? { listReturn: search.listReturn } : {}),
      },
      replace: true,
    })
  }, [
    activeTab,
    departureId,
    navigate,
    search.counterpartyKeyword,
    search.listReturn,
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
      <Result
        status="404"
        title="发团不存在"
        subTitle="缺少有效的发团编号。"
        extra={
          <Link to="/departure">
            <Button type="primary">返回发团列表</Button>
          </Link>
        }
      />
    )
  }

  if (!departure) {
    if (isLoading) {
      return <DepartureDetailShellSkeleton activeTab={activeTab} />
    }
    if (isError && !(error instanceof ApiError && error.code === 404)) {
      return (
        <Result
          status="error"
          title="发团详情加载失败"
          subTitle={error instanceof Error ? error.message : '请稍后重试'}
          extra={[
            <Button key="retry" type="primary" onClick={() => void refetch()}>
              重新加载
            </Button>,
            <Link key="back" to="/departure">
              <Button>返回发团列表</Button>
            </Link>,
          ]}
        />
      )
    }
    return (
      <Result
        status="404"
        title="发团不存在"
        subTitle="该发团可能已被删除或您无权访问。"
        extra={
          <Link to="/departure">
            <Button type="primary">返回发团列表</Button>
          </Link>
        }
      />
    )
  }

  const readOnly = departure.status === DepartureStatus.CLOSED
  const amountReadOnly =
    departure.status === DepartureStatus.SETTLED ||
    departure.status === DepartureStatus.CLOSED
  const financeReadOnly = readOnly || !canMutateFinance(menuKeys)
  const counterpartyKeyword =
    typeof search.counterpartyKeyword === 'string' ? search.counterpartyKeyword : undefined

  const visibleTabs = DEPARTURE_DETAIL_TABS.filter((tab) =>
    isDepartureDetailTabVisible(tab.key, menuKeys),
  )

  const tabItems: NonNullable<TabsProps['items']> = visibleTabs.map((tab) => {
    if (tab.key === 'overview') {
      return {
        key: tab.key,
        label: tab.label,
        children: wrapTabPane(
          <DepartureOverview
            departure={departure}
            animateEnter={!animatedOverviewDepartureIds.current.has(departure.id)}
            mutationLocked={readOnly || amountReadOnly || !canEdit}
          />,
        ),
      }
    }

    if (tab.key === 'sourceOrders') {
      return {
        key: tab.key,
        label: tab.label,
        children: wrapTabPane(
          <SourceOrdersTab
            departure={departure}
            readOnly={readOnly}
            canEdit={canEdit}
            amountReadOnly={amountReadOnly}
          />,
        ),
      }
    }

    if (tab.key === 'execution') {
      return {
        key: tab.key,
        label: tab.label,
        children: wrapTabPane(
          <ExecutionTab
            departure={departure}
            segmentId={search.segmentId}
            highlightDepartureResourceId={search.highlightDepartureResourceId}
            readOnly={readOnly}
            canEdit={canEdit}
            amountReadOnly={amountReadOnly}
          />,
        ),
      }
    }

    if (tab.key === 'receivables') {
      return {
        key: tab.key,
        label: tab.label,
        children: wrapTabPane(
          <PaymentScheduleWorkspace
            scope="departure"
            direction="receivable"
            departureId={departure.id}
            readOnly={financeReadOnly}
            highlightSourceOrderId={search.highlightSourceOrderId}
            initialCounterpartyKeyword={counterpartyKeyword}
            onHighlightConsumed={clearFinanceHighlight}
          />,
        ),
      }
    }

    if (tab.key === 'payables') {
      return {
        key: tab.key,
        label: tab.label,
        children: wrapTabPane(
          <PaymentScheduleWorkspace
            scope="departure"
            direction="payable"
            departureId={departure.id}
            readOnly={financeReadOnly}
            highlightSegmentResourceId={search.highlightSegmentResourceId}
            initialCounterpartyKeyword={counterpartyKeyword}
            onHighlightConsumed={clearFinanceHighlight}
          />,
        ),
      }
    }

    if (tab.key === 'transactions') {
      return {
        key: tab.key,
        label: tab.label,
        children: wrapTabPane(
          <TransactionsWorkspace
            scope="departure"
            departureId={departure.id}
            readOnly={financeReadOnly}
            initialDirection={resolveTransactionDirection(search.direction)}
          />,
        ),
      }
    }

    return {
      key: tab.key,
      label: tab.label,
      children: wrapTabPane(
        <VerificationsWorkspace
          scope="departure"
          departureId={departure.id}
          readOnly={financeReadOnly}
          deepLinkSearch={{
            transactionNo: search.transactionNo,
            scheduleNo: search.scheduleNo,
          }}
        />,
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
      <DepartureHeader departure={departure} canEdit={canEdit} onUpdated={handleUpdated} />

      <Tabs
        aria-label="发团详情功能"
        activeKey={activeTab}
        onChange={handleTabChange}
        items={tabItems}
      />
    </div>
  )
}
