import dayjs from 'dayjs'
import { Button, Card, DatePicker, Input, Select, Space } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { PaymentScheduleStatus } from '@xiaotuanbao/shared'
import { listFinanceDepartureOptions } from '@/services/finance.service'
import { PAYMENT_SCHEDULE_STATUS_OPTIONS } from '../catalog'

export type DueDateRange = [string | undefined, string | undefined] | null

interface PaymentScheduleFiltersProps {
  departureId?: string
  statusFilter?: PaymentScheduleStatus
  keyword: string
  dueDateRange: DueDateRange
  showDepartureFilter: boolean
  onDepartureChange: (value?: string) => void
  onStatusChange: (value?: PaymentScheduleStatus) => void
  onKeywordChange: (value: string) => void
  onDueDateRangeChange: (value: DueDateRange) => void
  onReset: () => void
}

export function PaymentScheduleFilters({
  departureId,
  statusFilter,
  keyword,
  dueDateRange,
  showDepartureFilter,
  onDepartureChange,
  onStatusChange,
  onKeywordChange,
  onDueDateRangeChange,
  onReset,
}: PaymentScheduleFiltersProps) {
  const { data: departuresResult } = useQuery({
    queryKey: ['departures', 'finance-filter'],
    queryFn: listFinanceDepartureOptions,
    enabled: showDepartureFilter,
  })

  const departureOptions =
    departuresResult?.map((departure) => ({
      value: departure.id,
      label: `${departure.departureNo} · ${departure.name}`,
    })) ?? []

  return (
    <Card style={{ marginBottom: 16 }}>
      <Space wrap>
        {showDepartureFilter ? (
          <Select
            allowClear
            showSearch
            placeholder="筛选发团"
            style={{ width: 280 }}
            value={departureId}
            onChange={onDepartureChange}
            options={departureOptions}
            optionFilterProp="label"
          />
        ) : null}
        <Input.Search
          allowClear
          placeholder="搜索节点编号 / 标题"
          style={{ width: 220 }}
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          onSearch={(value) => onKeywordChange(value.trim())}
        />
        <Select
          allowClear
          placeholder="节点状态"
          style={{ width: 140 }}
          value={statusFilter}
          onChange={onStatusChange}
          options={[...PAYMENT_SCHEDULE_STATUS_OPTIONS]}
        />
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
        />
        <Button onClick={onReset}>重置</Button>
      </Space>
    </Card>
  )
}
