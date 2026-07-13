import dayjs from 'dayjs'
import { Button, Card, Cascader, DatePicker, Input, Select, Space } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { CounterpartyType, PaymentScheduleStatus } from '@xiaotuanbao/shared'
import {
  listDeparturePayableCounterparties,
  listDepartureReceivableCounterparties,
  listFinanceDepartureOptions,
} from '@/services/finance.service'
import { PAYMENT_SCHEDULE_STATUS_OPTIONS } from '../catalog'
import {
  buildCounterpartyCascaderOptions,
  toCounterpartyCascaderValue,
} from '../utils/payment-schedule-counterparty-filter'

export type DueDateRange = [string | undefined, string | undefined] | null

interface PaymentScheduleFiltersProps {
  departureId?: string
  statusFilter?: PaymentScheduleStatus
  keyword: string
  dueDateRange: DueDateRange
  showDepartureFilter: boolean
  showCounterpartyFilter: boolean
  direction: 'receivable' | 'payable'
  counterpartyType?: CounterpartyType
  counterpartyEntityKey?: string
  onDepartureChange: (value?: string) => void
  onStatusChange: (value?: PaymentScheduleStatus) => void
  onKeywordChange: (value: string) => void
  onDueDateRangeChange: (value: DueDateRange) => void
  onCounterpartyTypeChange: (value?: CounterpartyType) => void
  onCounterpartyEntityKeyChange: (value?: string) => void
  onReset: () => void
}

export function PaymentScheduleFilters({
  departureId,
  statusFilter,
  keyword,
  dueDateRange,
  showDepartureFilter,
  showCounterpartyFilter,
  direction,
  counterpartyType,
  counterpartyEntityKey,
  onDepartureChange,
  onStatusChange,
  onKeywordChange,
  onDueDateRangeChange,
  onCounterpartyTypeChange,
  onCounterpartyEntityKeyChange,
  onReset,
}: PaymentScheduleFiltersProps) {
  const { data: departuresResult } = useQuery({
    queryKey: ['departures', 'finance-filter'],
    queryFn: listFinanceDepartureOptions,
    enabled: showDepartureFilter,
  })

  const { data: counterparties = [] } = useQuery({
    queryKey: ['departure-schedule-counterparties', direction, departureId],
    queryFn: () => {
      if (!departureId) {
        throw new Error('发团 ID 缺失')
      }
      return direction === 'receivable'
        ? listDepartureReceivableCounterparties(departureId)
        : listDeparturePayableCounterparties(departureId)
    },
    enabled: showCounterpartyFilter && Boolean(departureId),
  })

  const departureOptions =
    departuresResult?.map((departure) => ({
      value: departure.id,
      label: `${departure.departureNo} · ${departure.name}`,
    })) ?? []

  const counterpartyOptions = buildCounterpartyCascaderOptions(direction, counterparties)
  const counterpartyValue = toCounterpartyCascaderValue(
    counterpartyType,
    counterpartyEntityKey,
  )

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
          <Cascader
            allowClear
            changeOnSelect
            showSearch
            placeholder="往来对象"
            style={{ width: 280, maxWidth: '100%' }}
            options={counterpartyOptions}
            value={counterpartyValue}
            onChange={(value) => {
              if (!value || value.length === 0) {
                onCounterpartyTypeChange(undefined)
                onCounterpartyEntityKeyChange(undefined)
                return
              }
              onCounterpartyTypeChange(value[0] as CounterpartyType)
              onCounterpartyEntityKeyChange(
                typeof value[1] === 'string' ? value[1] : undefined,
              )
            }}
          />
        ) : null}
        <Select
          allowClear
          placeholder="节点状态"
          style={{ width: 140, maxWidth: '100%' }}
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
          style={{ maxWidth: '100%' }}
        />
        <Button onClick={onReset}>重置</Button>
      </Space>
    </Card>
  )
}
