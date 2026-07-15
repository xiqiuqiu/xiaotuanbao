import dayjs from 'dayjs'
import { Button, Card, DatePicker, Input, Select, Space } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { PaymentScheduleStatus } from '@xiaotuanbao/shared'
import { listFinanceDepartureOptions } from '@/services/finance.service'
import { buildDepartureDateRangePresets } from '@/utils/dateRangePresets'
import { FINANCE_DEPARTURE_OPTIONS_QUERY_KEY } from '../queries/finance-query-keys'
import {
  PAYABLE_SCHEDULE_FILTER_OPTIONS,
  PAYMENT_SCHEDULE_STATUS_OPTIONS,
} from '../catalog'

export type DueDateRange = [string | undefined, string | undefined] | null
export type DepartureDateRange = [string | undefined, string | undefined] | null
export type PaymentScheduleStatusFilter = PaymentScheduleStatus | 'voided'

export type PaymentScheduleFiltersScope = 'global' | 'departure' | 'partner'

interface PaymentScheduleFiltersProps {
  departureId?: string
  statusFilter?: PaymentScheduleStatusFilter
  keyword: string
  counterpartyKeyword: string
  dueDateRange: DueDateRange
  departureDateRange?: DepartureDateRange
  /**
   * 场景决定筛选项组合：
   * - global：显示发团筛选与往来对象搜索；
   * - departure：发团已锚定，隐藏发团筛选；
   * - partner：往来对象已锚定，隐藏往来对象搜索，
   *   改为出团日期区间主时间轴（与确认单周期同口径）。
   */
  scope: PaymentScheduleFiltersScope
  /** 应收展示到期日筛选与「已逾期」；应付本版隐藏（ADR-0019）。 */
  isReceivable: boolean
  onDepartureChange: (value?: string) => void
  onStatusChange: (value?: PaymentScheduleStatusFilter) => void
  onKeywordChange: (value: string) => void
  onCounterpartyKeywordChange: (value: string) => void
  onDueDateRangeChange: (value: DueDateRange) => void
  onDepartureDateRangeChange?: (value: DepartureDateRange) => void
  onReset: () => void
}

export function PaymentScheduleFilters({
  departureId,
  statusFilter,
  keyword,
  counterpartyKeyword,
  dueDateRange,
  departureDateRange = null,
  scope,
  isReceivable,
  onDepartureChange,
  onStatusChange,
  onKeywordChange,
  onCounterpartyKeywordChange,
  onDueDateRangeChange,
  onDepartureDateRangeChange,
  onReset,
}: PaymentScheduleFiltersProps) {
  const showDepartureFilter = scope === 'global'
  const showCounterpartyFilter = scope !== 'partner'
  const showDepartureDateFilter = scope === 'partner'

  const { data: departuresResult } = useQuery({
    queryKey: FINANCE_DEPARTURE_OPTIONS_QUERY_KEY,
    queryFn: listFinanceDepartureOptions,
    enabled: showDepartureFilter,
  })

  const departureOptions =
    departuresResult?.map((departure) => ({
      value: departure.id,
      label: `${departure.departureNo} · ${departure.name}`,
    })) ?? []

  const statusOptions = isReceivable
    ? PAYMENT_SCHEDULE_STATUS_OPTIONS
    : PAYABLE_SCHEDULE_FILTER_OPTIONS

  return (
    <Card style={{ marginBottom: 16 }}>
      <Space wrap style={{ width: '100%' }}>
        {showDepartureFilter ? (
          <Select
            allowClear
            showSearch
            placeholder="筛选发团"
            style={{ width: 280, maxWidth: '100%' }}
            value={departureId}
            onChange={onDepartureChange}
            options={departureOptions}
            optionFilterProp="label"
          />
        ) : null}
        <Input.Search
          allowClear
          placeholder="搜索节点编号 / 标题"
          style={{ width: 220, maxWidth: '100%' }}
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          onSearch={(value) => onKeywordChange(value.trim())}
        />
        {showCounterpartyFilter ? (
          <Input.Search
            allowClear
            placeholder="往来对象"
            style={{ width: 200, maxWidth: '100%' }}
            value={counterpartyKeyword}
            onChange={(event) => onCounterpartyKeywordChange(event.target.value)}
            onSearch={(value) => onCounterpartyKeywordChange(value.trim())}
          />
        ) : null}
        <Select
          allowClear
          placeholder="节点状态"
          style={{ width: 140, maxWidth: '100%' }}
          value={statusFilter}
          onChange={onStatusChange}
          options={[...statusOptions]}
        />
        {showDepartureDateFilter ? (
          <DatePicker.RangePicker
            allowClear
            allowEmpty={[true, true]}
            placeholder={['出团日期起', '出团日期止']}
            presets={buildDepartureDateRangePresets()}
            value={
              departureDateRange
                ? [
                    departureDateRange[0] ? dayjs(departureDateRange[0]) : null,
                    departureDateRange[1] ? dayjs(departureDateRange[1]) : null,
                  ]
                : null
            }
            onChange={(values) =>
              onDepartureDateRangeChange?.(
                values
                  ? [values[0]?.format('YYYY-MM-DD'), values[1]?.format('YYYY-MM-DD')]
                  : null,
              )
            }
            style={{ maxWidth: '100%' }}
          />
        ) : null}
        {isReceivable ? (
          <DatePicker.RangePicker
            allowClear
            placeholder={['到期日起', '到期日止']}
            value={
              dueDateRange
                ? [
                    dueDateRange[0] ? dayjs(dueDateRange[0]) : null,
                    dueDateRange[1] ? dayjs(dueDateRange[1]) : null,
                  ]
                : null
            }
            onChange={(values) =>
              onDueDateRangeChange(
                values
                  ? [values[0]?.format('YYYY-MM-DD'), values[1]?.format('YYYY-MM-DD')]
                  : null,
              )
            }
            style={{ maxWidth: '100%' }}
          />
        ) : null}
        <Button onClick={onReset}>重置</Button>
      </Space>
    </Card>
  )
}
