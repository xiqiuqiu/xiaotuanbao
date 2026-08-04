import { Space, Typography } from 'antd'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Select,
  Skeleton,
} from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import {
  downloadDepartureRouteLedger,
  getDepartureRouteLedger,
} from '@/services/departure.service'
import {
  type DepartureListSearch,
} from '../utils/departure-list-search'
import { resolveRouteLedgerQueryGate } from '../utils/route-ledger-query'
import { listRouteLedgerReportStack } from '../utils/route-ledger-reports'
import { DateSeparator } from './route-ledger/DateSeparator'
import { RouteLedgerDepartureReport } from './route-ledger/RouteLedgerDepartureReport'
import styles from './RouteLedgerViewPanel.module.css'

type RouteLedgerViewPanelProps = {
  viewNavigation?: ReactNode
  routeNames: string[]
  routeNamesLoading: boolean
  routeName?: string
  startDateRange: [string | undefined, string | undefined] | null
  onRouteNameChange: (value?: string) => void
  onStartDateRangeChange: (
    value: [string | undefined, string | undefined] | null,
  ) => void
  onSwitchToDepartureList: () => void
  listReturnSearch?: DepartureListSearch
}

/**
 * 线路视图（#183 / #221）：
 * - 双轴筛选（路线和/或出团日期），筛选以发团管理 URL 为真相源；
 * - 一团一份完整日报表；换日轻量分隔；不做日/路线跨团加总。
 */
export function RouteLedgerViewPanel({
  viewNavigation,
  routeNames,
  routeNamesLoading,
  routeName,
  startDateRange,
  onRouteNameChange,
  onStartDateRangeChange,
  onSwitchToDepartureList,
  listReturnSearch,
}: RouteLedgerViewPanelProps) {
  const [exporting, setExporting] = useState(false)
  const startDateFrom = startDateRange?.[0]
  const startDateTo = startDateRange?.[1]
  const queryGate = resolveRouteLedgerQueryGate({
    routeName,
    startDateFrom,
    startDateTo,
  })

  const {
    data: ledger,
    isLoading: ledgerLoading,
    isError: ledgerError,
    error: ledgerQueryError,
    refetch: refetchLedger,
  } = useQuery({
    queryKey: [
      'departures',
      'route-ledger',
      queryGate.status === 'ready' ? queryGate.params : null,
    ],
    queryFn: ({ signal }) => {
      if (queryGate.status !== 'ready') {
        throw new Error('线路视图查询条件未就绪')
      }
      return getDepartureRouteLedger(queryGate.params, signal)
    },
    enabled: queryGate.status === 'ready',
  })

  const options = routeNames.map((name) => ({
    value: name,
    label: name,
  }))

  const reportStack = useMemo(
    () => (ledger ? listRouteLedgerReportStack(ledger.dateBlocks) : []),
    [ledger],
  )

  async function handleExport() {
    if (queryGate.status !== 'ready') {
      return
    }
    setExporting(true)
    try {
      await downloadDepartureRouteLedger(queryGate.params)
    } catch {
      // downloadBinary already surfaces the error message
    } finally {
      setExporting(false)
    }
  }

  const apiErrorMessage =
    ledgerQueryError && typeof ledgerQueryError === 'object' && 'message' in ledgerQueryError
      ? String((ledgerQueryError as { message?: unknown }).message ?? '')
      : ''

  let body: ReactNode
  let hasReportResults = false
  if (queryGate.status === 'empty') {
    body = (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <Space orientation="vertical" size={4}>
            <Typography.Text>{queryGate.message}</Typography.Text>
            <Typography.Text type="secondary">{queryGate.detail}</Typography.Text>
          </Space>
        }
        style={{ padding: '8px 0' }}
      />
    )
  } else if (queryGate.status === 'invalid') {
    body = <Alert type="warning" showIcon title={queryGate.message} />
  } else if (ledgerLoading) {
    body = <Skeleton active paragraph={{ rows: 6 }} />
  } else if (ledgerError) {
    body = (
      <Alert
        type="error"
        showIcon
        title="线路视图加载失败"
        description={apiErrorMessage || '网络异常，请稍后重试'}
        action={
          <Typography.Link onClick={() => void refetchLedger()}>重试</Typography.Link>
        }
      />
    )
  } else if (!ledger?.dateBlocks.length) {
    const emptyTitle = routeName
      ? `「${routeName}」暂无匹配发团`
      : '所选日期范围内暂无匹配发团'
    body = (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <Space orientation="vertical" size={4}>
            <Typography.Text>{emptyTitle}</Typography.Text>
            <Typography.Text type="secondary">
              可调整筛选条件，或
              <Typography.Link onClick={onSwitchToDepartureList}>返回发团视图</Typography.Link>
            </Typography.Text>
          </Space>
        }
        style={{ padding: '8px 0' }}
      />
    )
  } else {
    hasReportResults = true
    body = (
      <Space orientation="vertical" size={20} style={{ width: '100%' }}>
        {reportStack.map((item) => {
          if (item.type === 'date-separator') {
            return <DateSeparator key={`sep-${item.startDate}`} startDate={item.startDate} />
          }
          return (
            <RouteLedgerDepartureReport
              key={item.departure.departureId}
              startDate={item.startDate}
              routeName={item.routeName}
              departure={item.departure}
              listReturnSearch={listReturnSearch}
            />
          )
        })}
      </Space>
    )
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Card className={styles.filterWorkspace} styles={{ body: { padding: 0 } }}>
        {viewNavigation}
        <div className={styles.filterArea}>
          <Form layout="inline" className={styles.filterForm} colon={false}>
            <Form.Item label="路线名称">
              <Select
                showSearch={{ optionFilterProp: 'label' }}
                allowClear
                placeholder="选择路线名称"
                aria-label="路线名称"
                style={{ width: 280 }}
                loading={routeNamesLoading}
                options={options}
                value={routeName}
                onChange={(value) => onRouteNameChange(value)}
              />
            </Form.Item>
            <Form.Item label="出团日期">
              <DatePicker.RangePicker
                allowClear
                aria-label="出团日期"
                value={
                  startDateRange
                    ? [
                        startDateRange[0] ? dayjs(startDateRange[0]) : null,
                        startDateRange[1] ? dayjs(startDateRange[1]) : null,
                      ]
                    : null
                }
                onChange={(dates: [Dayjs | null, Dayjs | null] | null) => {
                  if (!dates?.[0] && !dates?.[1]) {
                    onStartDateRangeChange(null)
                    return
                  }
                  onStartDateRangeChange([
                    dates?.[0]?.format('YYYY-MM-DD'),
                    dates?.[1]?.format('YYYY-MM-DD'),
                  ])
                }}
              />
            </Form.Item>
            <Form.Item>
              <Button
                icon={<DownloadOutlined />}
                loading={exporting}
                disabled={queryGate.status !== 'ready' || ledgerLoading || !hasReportResults}
                onClick={() => void handleExport()}
              >
                导出 Excel
              </Button>
            </Form.Item>
          </Form>
        </div>
        {!hasReportResults ? <div className={styles.stateArea}>{body}</div> : null}
      </Card>
      {hasReportResults ? body : null}
    </Space>
  )
}
