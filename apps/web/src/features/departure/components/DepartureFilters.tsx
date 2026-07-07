import { Button, Card, DatePicker, Input, Select, Space } from 'antd'
import { DepartureStatus } from '@xiaotuanbao/shared'
import { DEPARTURE_STATUS_OPTIONS } from '../catalog'

export type DateRangeStrings = [string | undefined, string | undefined] | null

interface DepartureFiltersProps {
  statusFilter?: DepartureStatus
  onSearch: (value: string) => void
  onStatusChange: (value?: DepartureStatus) => void
  onStartDateRangeChange: (value: DateRangeStrings) => void
  onReset: () => void
}

export function DepartureFilters({
  statusFilter,
  onSearch,
  onStatusChange,
  onStartDateRangeChange,
  onReset,
}: DepartureFiltersProps) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <Space wrap>
        <Input.Search
          allowClear
          placeholder="搜索团号 / 团名"
          style={{ width: 240 }}
          onSearch={(value) => onSearch(value.trim())}
        />
        <Select
          allowClear
          placeholder="发团状态"
          style={{ width: 140 }}
          value={statusFilter}
          onChange={onStatusChange}
          options={[...DEPARTURE_STATUS_OPTIONS]}
        />
        <DatePicker.RangePicker
          allowClear
          placeholder={['出团日期起', '出团日期止']}
          onChange={(values) =>
            onStartDateRangeChange(
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
