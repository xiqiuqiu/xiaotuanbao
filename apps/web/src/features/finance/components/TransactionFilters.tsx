import dayjs from 'dayjs'
import { Button, Card, DatePicker, Input, Select, Space } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { TransactionDirection, TransactionWriteoffStatus } from '@xiaotuanbao/shared'
import { listDepartures } from '@/services/departure.service'
import {
  TRANSACTION_DIRECTION_OPTIONS,
  TRANSACTION_STATUS_OPTIONS,
  TRANSACTION_WRITEOFF_STATUS_OPTIONS,
} from '../catalog'

export type TransactionDateRange = [string | undefined, string | undefined] | null

export function getDefaultTransactionDateRange(): [string, string] {
  return [dayjs().subtract(30, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]
}

interface TransactionFiltersProps {
  dateRange: TransactionDateRange
  direction?: TransactionDirection
  partnerKeyword: string
  writeoffStatus?: TransactionWriteoffStatus
  transactionNo: string
  departureId?: string
  status?: 'normal' | 'voided'
  onDateRangeChange: (value: TransactionDateRange) => void
  onDirectionChange: (value?: TransactionDirection) => void
  onPartnerKeywordChange: (value: string) => void
  onWriteoffStatusChange: (value?: TransactionWriteoffStatus) => void
  onTransactionNoChange: (value: string) => void
  onDepartureChange: (value?: string) => void
  onStatusChange: (value?: 'normal' | 'voided') => void
  onReset: () => void
}

export function TransactionFilters({
  dateRange,
  direction,
  partnerKeyword,
  writeoffStatus,
  transactionNo,
  departureId,
  status,
  onDateRangeChange,
  onDirectionChange,
  onPartnerKeywordChange,
  onWriteoffStatusChange,
  onTransactionNoChange,
  onDepartureChange,
  onStatusChange,
  onReset,
}: TransactionFiltersProps) {
  const { data: departuresResult } = useQuery({
    queryKey: ['departures', 'transaction-filter'],
    queryFn: () => listDepartures({ pageSize: 100 }),
  })

  const departureOptions =
    departuresResult?.items.map((departure) => ({
      value: departure.id,
      label: `${departure.departureNo} · ${departure.name}`,
    })) ?? []

  return (
    <Card style={{ marginBottom: 16 }}>
      <Space wrap>
        <DatePicker.RangePicker
          allowClear
          placeholder={['交易日期起', '交易日期止']}
          value={
            dateRange
              ? [
                  dateRange[0] ? dayjs(dateRange[0]) : null,
                  dateRange[1] ? dayjs(dateRange[1]) : null,
                ]
              : null
          }
          onChange={(values) =>
            onDateRangeChange(
              values
                ? [values[0]?.format('YYYY-MM-DD'), values[1]?.format('YYYY-MM-DD')]
                : null,
            )
          }
        />
        <Select
          allowClear
          placeholder="收支方向"
          style={{ width: 120 }}
          value={direction}
          onChange={onDirectionChange}
          options={[...TRANSACTION_DIRECTION_OPTIONS]}
        />
        <Input.Search
          allowClear
          placeholder="往来对象"
          style={{ width: 160 }}
          value={partnerKeyword}
          onChange={(event) => onPartnerKeywordChange(event.target.value)}
          onSearch={(value) => onPartnerKeywordChange(value.trim())}
        />
        <Select
          allowClear
          placeholder="核销状态"
          style={{ width: 120 }}
          value={writeoffStatus}
          onChange={onWriteoffStatusChange}
          options={[...TRANSACTION_WRITEOFF_STATUS_OPTIONS]}
        />
        <Input.Search
          allowClear
          placeholder="流水号"
          style={{ width: 180 }}
          value={transactionNo}
          onChange={(event) => onTransactionNoChange(event.target.value)}
          onSearch={(value) => onTransactionNoChange(value.trim())}
        />
        <Select
          allowClear
          showSearch
          placeholder="关联发团"
          style={{ width: 280 }}
          value={departureId}
          onChange={onDepartureChange}
          options={departureOptions}
          optionFilterProp="label"
        />
        <Select
          allowClear
          placeholder="流水状态"
          style={{ width: 120 }}
          value={status}
          onChange={onStatusChange}
          options={[...TRANSACTION_STATUS_OPTIONS]}
        />
        <Button onClick={onReset}>重置</Button>
      </Space>
    </Card>
  )
}
