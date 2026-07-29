import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { Tabs } from 'antd'
import type { TabsProps } from 'antd'
import { useNavigate } from '@tanstack/react-router'
import {
  DepartureStatus,
  TransactionDirection,
} from '@xiaotuanbao/shared'
import type { DepartureDetail } from '@/types/api'
import { PaymentScheduleWorkspace } from '@/features/finance/components/PaymentScheduleWorkspace'
import { TransactionsWorkspace } from '@/features/finance/components/TransactionsWorkspace'
import { VerificationsWorkspace } from '@/features/finance/components/VerificationsWorkspace'
import { canMutateFinance } from '@/features/finance/utils/finance-permission'
import { DepartureOverview } from './DepartureOverview'
import { SourceOrdersTab } from './SourceOrdersTab'
import { ExecutionTab } from './ExecutionTab'
import { IncomeRecordsPrototypeHost } from '../prototype/income-records/IncomeRecordsPrototypeHost'
import {
  DEPARTURE_DETAIL_TABS,
  isDepartureDetailTabVisible,
  type DepartureDetailTabKey,
} from '../catalog'
import styles from '../pages/DepartureDetailPage.module.css'

type DepartureDetailSearch = {
  segmentId?: string
  highlightDepartureResourceId?: string
  highlightSourceOrderId?: string
  highlightSegmentResourceId?: string
  counterpartyKeyword?: string
  sourceId?: string
  scheduleNo?: string
  direction?: string
  transactionNo?: string
  listReturn?: string
  variant?: string
}

type DepartureDetailTabsProps = {
  departure: DepartureDetail
  activeTab: DepartureDetailTabKey
  menuKeys: string[]
  canEdit: boolean
  search: DepartureDetailSearch
  onTabChange: (key: string) => void
}

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

export function DepartureDetailTabs({
  departure,
  activeTab,
  menuKeys,
  canEdit,
  search,
  onTabChange,
}: DepartureDetailTabsProps) {
  const navigate = useNavigate()
  const animatedOverviewDepartureIds = useRef(new Set<string>())

  const readOnly = departure.status === DepartureStatus.CLOSED
  const amountReadOnly =
    departure.status === DepartureStatus.SETTLED ||
    departure.status === DepartureStatus.CLOSED
  const financeReadOnly = readOnly || !canMutateFinance(menuKeys)
  const counterpartyKeyword =
    typeof search.counterpartyKeyword === 'string' ? search.counterpartyKeyword : undefined
  const filterSourceOrderId =
    typeof search.sourceId === 'string' ? search.sourceId : undefined

  const clearFinanceHighlight = useCallback(() => {
    if (!search.highlightSourceOrderId && !search.highlightSegmentResourceId) {
      return
    }

    navigate({
      to: '/departure/$departureId',
      params: { departureId: departure.id },
      search: {
        tab: activeTab,
        ...(search.segmentId ? { segmentId: search.segmentId } : {}),
        ...(search.counterpartyKeyword
          ? { counterpartyKeyword: search.counterpartyKeyword }
          : {}),
        ...(search.sourceId ? { sourceId: search.sourceId } : {}),
        ...(search.scheduleNo ? { scheduleNo: search.scheduleNo } : {}),
        ...(search.listReturn ? { listReturn: search.listReturn } : {}),
      },
      replace: true,
    })
  }, [
    activeTab,
    departure.id,
    navigate,
    search.counterpartyKeyword,
    search.listReturn,
    search.highlightSegmentResourceId,
    search.highlightSourceOrderId,
    search.scheduleNo,
    search.sourceId,
    search.segmentId,
  ])

  useEffect(() => {
    if (activeTab === 'overview') {
      animatedOverviewDepartureIds.current.add(departure.id)
    }
  }, [activeTab, departure.id])

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

    if (tab.key === 'incomeRecords') {
      return {
        key: tab.key,
        label: tab.label,
        children: wrapTabPane(<IncomeRecordsPrototypeHost />),
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
            filterSourceOrderId={filterSourceOrderId}
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
            highlightSourceOrderId={search.highlightSourceOrderId}
            highlightSegmentResourceId={search.highlightSegmentResourceId}
            initialCounterpartyKeyword={counterpartyKeyword}
            scheduleNo={search.scheduleNo}
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
    <Tabs
      aria-label="发团详情功能"
      activeKey={activeTab}
      onChange={onTabChange}
      items={tabItems}
    />
  )
}
