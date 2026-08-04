import { useMemo, useState } from 'react'
import {
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Select,
  Space,
  Tabs,
  Tooltip,
  Typography,
  message,
} from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import {
  MOCK_REPORTS,
  MOCK_ROUTE_NAMES,
  filterMockReports,
} from './shared'
import { downloadPrototypeRouteLedgerExcel } from './prototype-export'
import { RouteLedgerReportList } from './VariantC'
import styles from './route-ledger-mode-prototype.module.css'

type DepartureViewKey = 'departure-list' | 'route-ledger'

const DEFAULT_ROUTE = MOCK_ROUTE_NAMES[0]
const DEFAULT_RANGE: [Dayjs, Dayjs] = [dayjs('2026-07-28'), dayjs('2026-07-31')]

/**
 * PROTOTYPE — 线路视图收入/成本模式定稿预览。
 * 一团日报：Radio 按钮组切换客源收入 / 执行成本 / 拼出往来。
 */
export function RouteLedgerModePrototypeHost() {
  const [activeView, setActiveView] = useState<DepartureViewKey>('route-ledger')
  const [routeName, setRouteName] = useState<string>(DEFAULT_ROUTE)
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(DEFAULT_RANGE)
  const [exporting, setExporting] = useState(false)

  const isRouteLedgerView = activeView === 'route-ledger'

  const filter = useMemo(
    () => ({
      routeName,
      startDateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
      startDateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    }),
    [dateRange, routeName],
  )

  const filteredReports = useMemo(
    () => filterMockReports(MOCK_REPORTS, filter),
    [filter],
  )

  const canExport = isRouteLedgerView && filteredReports.length > 0

  async function handleExport() {
    if (!canExport) {
      return
    }
    setExporting(true)
    try {
      await downloadPrototypeRouteLedgerExcel(filteredReports, filter)
    } catch {
      message.error('原型 Excel 导出失败')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <Card className={styles.filterCard}>
        <Tabs
          activeKey={activeView}
          items={[
            { key: 'departure-list', label: '发团视图' },
            { key: 'route-ledger', label: '线路视图' },
          ]}
          styles={{
            header: { margin: 0, paddingInline: 16 },
            body: { display: 'none' },
          }}
          onChange={(value) => setActiveView(value as DepartureViewKey)}
        />
        <div className={styles.filterArea}>
          <Form layout="inline" className={styles.filterForm} colon={false}>
            <Form.Item label="路线名称">
              <Select
                style={{ width: 280 }}
                value={routeName}
                disabled={!isRouteLedgerView}
                options={MOCK_ROUTE_NAMES.map((name) => ({ value: name, label: name }))}
                onChange={setRouteName}
              />
            </Form.Item>
            <Form.Item label="出团日期">
              <DatePicker.RangePicker
                value={dateRange}
                disabled={!isRouteLedgerView}
                onChange={(dates) => {
                  if (!dates?.[0] || !dates?.[1]) {
                    setDateRange(null)
                    return
                  }
                  setDateRange([dates[0], dates[1]])
                }}
              />
            </Form.Item>
            <Form.Item>
              <Tooltip title="导出当前筛选：路线名称 + 出团日期区间内的发团（与线上一致）">
                <Button
                  icon={<DownloadOutlined />}
                  loading={exporting}
                  disabled={!canExport}
                  onClick={() => void handleExport()}
                >
                  导出 Excel
                </Button>
              </Tooltip>
            </Form.Item>
          </Form>
        </div>
      </Card>

      <Space orientation="vertical" size={16} style={{ width: '100%', marginTop: 16 }}>
        {!isRouteLedgerView ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Space orientation="vertical" size={4}>
                <Typography.Text>发团视图（原型占位）</Typography.Text>
                <Typography.Text type="secondary">
                  正式页为发团列表；本原型仅预览线路视图日报
                </Typography.Text>
              </Space>
            }
          />
        ) : filteredReports.length > 0 ? (
          <RouteLedgerReportList reports={filteredReports} />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Space orientation="vertical" size={4}>
                <Typography.Text>当前筛选无匹配发团</Typography.Text>
                <Typography.Text type="secondary">
                  可调整路线或出团日期后再导出
                </Typography.Text>
              </Space>
            }
          />
        )}
      </Space>
    </>
  )
}
