import type { ReactNode } from 'react'
import { Button, Card, DatePicker, Input, Select, Space } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { TransactionDirection, TransactionWriteoffStatus } from '@xiaotuanbao/shared'
import dayjs from 'dayjs'
import { listFinanceDepartureOptions } from '@/services/finance.service'
import { FINANCE_DEPARTURE_OPTIONS_QUERY_KEY } from '../queries/finance-query-keys'
import {
  TRANSACTION_DIRECTION_OPTIONS,
  TRANSACTION_STATUS_OPTIONS,
  TRANSACTION_WRITEOFF_STATUS_OPTIONS,
} from '../catalog'
import type { TransactionDateRange } from '../utils/date-ranges'

interface TransactionFiltersProps {
  scope?: 'global' | 'departure'
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
  onApply?: () => void
  extra?: ReactNode
}

export function TransactionFilters({
  scope = 'global',
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
  onApply,
  extra,
}: TransactionFiltersProps) {
  const showDepartureFilter = scope === 'global'
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

  return (
    <Card style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <Space wrap>
          <DatePicker.RangePicker
            allowClear
            aria-label="交易日期"
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
            aria-label="流水方向"
            placeholder="流水方向"
            style={{ width: 120 }}
            value={direction}
            onChange={onDirectionChange}
            options={[...TRANSACTION_DIRECTION_OPTIONS]}
          />
          <Input.Search
            allowClear
            aria-label="往来对象"
            placeholder="往来对象"
            style={{ width: 160 }}
            value={partnerKeyword}
            onChange={(event) => onPartnerKeywordChange(event.target.value)}
            onSearch={(value) => onPartnerKeywordChange(value.trim())}
          />
          <Select
            allowClear
            aria-label="核销状态"
            placeholder="核销状态"
            style={{ width: 120 }}
            value={writeoffStatus}
            onChange={onWriteoffStatusChange}
            options={[...TRANSACTION_WRITEOFF_STATUS_OPTIONS]}
          />
          <Input.Search
            allowClear
            aria-label="流水单号"
            placeholder="流水单号"
            style={{ width: 180 }}
            value={transactionNo}
            onChange={(event) => onTransactionNoChange(event.target.value)}
            onSearch={(value) => onTransactionNoChange(value.trim())}
          />
          {showDepartureFilter ? (
            <Select
              allowClear
              showSearch
              aria-label="关联发团"
              placeholder="关联发团"
              style={{ width: 280 }}
              value={departureId}
              onChange={onDepartureChange}
              options={departureOptions}
              optionFilterProp="label"
            />
          ) : null}
          <Select
            allowClear
            aria-label="流水状态"
            placeholder="流水状态"
            style={{ width: 120 }}
            value={status}
            onChange={onStatusChange}
            options={[...TRANSACTION_STATUS_OPTIONS]}
          />
          <Button
            autoInsertSpace={false}
            onClick={() => {
              onPartnerKeywordChange(partnerKeyword.trim())
              onTransactionNoChange(transactionNo.trim())
              onApply?.()
            }}
          >
            查询
          </Button>
          <Button autoInsertSpace={false} onClick={onReset}>
            重置
          </Button>
        </Space>
        {extra ? <div style={{ flexShrink: 0 }}>{extra}</div> : null}
      </div>
    </Card>
  )
}
