import dayjs from 'dayjs'
import { Button, Card, DatePicker, Input, Select, Space } from 'antd'
import {
  VERIFICATION_DIRECTION_OPTIONS,
  VERIFICATION_STATUS_OPTIONS,
} from '../catalog'

export type VerificationDateRange = [string | undefined, string | undefined] | null

export function getDefaultVerificationDateRange(): [string, string] {
  return [dayjs().subtract(30, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]
}

interface VerificationFiltersProps {
  scope: 'global' | 'departure'
  dateRange: VerificationDateRange
  direction?: string
  status?: string
  transactionNo: string
  scheduleNo: string
  departureKeyword: string
  onDateRangeChange: (value: VerificationDateRange) => void
  onDirectionChange: (value?: string) => void
  onStatusChange: (value?: string) => void
  onTransactionNoChange: (value: string) => void
  onScheduleNoChange: (value: string) => void
  onDepartureKeywordChange: (value: string) => void
  onReset: () => void
}

export function VerificationFilters({
  scope,
  dateRange,
  direction,
  status,
  transactionNo,
  scheduleNo,
  departureKeyword,
  onDateRangeChange,
  onDirectionChange,
  onStatusChange,
  onTransactionNoChange,
  onScheduleNoChange,
  onDepartureKeywordChange,
  onReset,
}: VerificationFiltersProps) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <Space wrap>
        <DatePicker.RangePicker
          allowClear
          placeholder={['核销日期起', '核销日期止']}
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
          placeholder="核销方向"
          style={{ width: 120 }}
          value={direction}
          onChange={onDirectionChange}
          options={[...VERIFICATION_DIRECTION_OPTIONS]}
        />
        <Select
          allowClear
          placeholder="核销状态"
          style={{ width: 120 }}
          value={status}
          onChange={onStatusChange}
          options={[...VERIFICATION_STATUS_OPTIONS]}
        />
        <Input.Search
          allowClear
          placeholder="流水号"
          style={{ width: 180 }}
          value={transactionNo}
          onChange={(event) => onTransactionNoChange(event.target.value)}
          onSearch={(value) => onTransactionNoChange(value.trim())}
        />
        <Input.Search
          allowClear
          placeholder="节点编号"
          style={{ width: 180 }}
          value={scheduleNo}
          onChange={(event) => onScheduleNoChange(event.target.value)}
          onSearch={(value) => onScheduleNoChange(value.trim())}
        />
        {scope === 'global' ? (
          <Input.Search
            allowClear
            placeholder="发团号/名称关键字"
            style={{ width: 200 }}
            value={departureKeyword}
            onChange={(event) => onDepartureKeywordChange(event.target.value)}
            onSearch={(value) => onDepartureKeywordChange(value.trim())}
          />
        ) : null}
        <Button onClick={onReset}>重置</Button>
      </Space>
    </Card>
  )
}
