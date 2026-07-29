import type { ReactNode } from 'react'
import { Button, Card, DatePicker, Input, Select, Space } from 'antd'
import dayjs from 'dayjs'
import { DepartureProgress, DepartureStatus, DepartureType } from '@xiaotuanbao/shared'
import {
  DEPARTURE_PROGRESS_OPTIONS,
  DEPARTURE_STATUS_OPTIONS,
  DEPARTURE_TYPE_OPTIONS,
} from '../catalog'

export type DateRangeStrings = [string | undefined, string | undefined] | null

export interface DepartureFilterValues {
  keyword?: string
  routeName?: string
  departureType?: DepartureType
  departureProgress?: DepartureProgress
  status?: DepartureStatus
  ownerUserId?: string
  partnerId?: string
  startDateFrom?: string
  startDateTo?: string
}

interface DepartureFiltersProps {
  viewNavigation?: ReactNode
  statusFilter?: DepartureStatus
  routeNameFilter?: string
  departureTypeFilter?: DepartureType
  departureProgressFilter?: DepartureProgress
  ownerUserIdFilter?: string
  partnerIdFilter?: string
  startDateRange?: DateRangeStrings
  ownerOptions: Array<{ value: string; label: string }>
  partnerOptions: Array<{ value: string; label: string }>
  onSearch: (value: string) => void
  onRouteNameChange: (value?: string) => void
  onDepartureTypeChange: (value?: DepartureType) => void
  onDepartureProgressChange: (value?: DepartureProgress) => void
  onStatusChange: (value?: DepartureStatus) => void
  onOwnerChange: (value?: string) => void
  onPartnerChange: (value?: string) => void
  onStartDateRangeChange: (value: DateRangeStrings) => void
  onReset: () => void
}

export function DepartureFilters({
  viewNavigation,
  statusFilter,
  routeNameFilter,
  departureTypeFilter,
  departureProgressFilter,
  ownerUserIdFilter,
  partnerIdFilter,
  startDateRange,
  ownerOptions,
  partnerOptions,
  onSearch,
  onRouteNameChange,
  onDepartureTypeChange,
  onDepartureProgressChange,
  onStatusChange,
  onOwnerChange,
  onPartnerChange,
  onStartDateRangeChange,
  onReset,
}: DepartureFiltersProps) {
  return (
    <Card style={{ marginBottom: 16 }} styles={{ body: { padding: 0 } }}>
      {viewNavigation}
      <div style={{ padding: 24 }}>
        <Space wrap>
          <Input.Search
            allowClear
            aria-label="搜索团号 / 团名"
            placeholder="搜索团号 / 团名"
            style={{ width: 240 }}
            onSearch={(value) => onSearch(value.trim())}
          />
          <Input
            allowClear
            aria-label="路线名称"
            placeholder="路线名称"
            style={{ width: 160 }}
            value={routeNameFilter}
            onChange={(event) => onRouteNameChange(event.target.value || undefined)}
          />
          <Select
            allowClear
            aria-label="发团类型"
            placeholder="发团类型"
            style={{ width: 120 }}
            value={departureTypeFilter}
            onChange={onDepartureTypeChange}
            options={[...DEPARTURE_TYPE_OPTIONS]}
          />
          <Select
            allowClear
            aria-label="出团进度"
            placeholder="出团进度"
            style={{ width: 120 }}
            value={departureProgressFilter}
            onChange={onDepartureProgressChange}
            options={[...DEPARTURE_PROGRESS_OPTIONS]}
          />
          <Select
            allowClear
            aria-label="发团状态"
            placeholder="发团状态"
            style={{ width: 120 }}
            value={statusFilter}
            onChange={onStatusChange}
            options={[...DEPARTURE_STATUS_OPTIONS]}
          />
          <Select
            allowClear
            aria-label="负责人"
            placeholder="负责人"
            style={{ width: 140 }}
            value={ownerUserIdFilter}
            onChange={onOwnerChange}
            options={ownerOptions}
            showSearch
            optionFilterProp="label"
          />
          <Select
            allowClear
            aria-label="发团客源"
            placeholder="发团客源"
            style={{ width: 160 }}
            value={partnerIdFilter}
            onChange={onPartnerChange}
            options={partnerOptions}
            showSearch
            optionFilterProp="label"
          />
          <DatePicker.RangePicker
            allowClear
            aria-label="出团日期"
            placeholder={['出团日期起', '出团日期止']}
            value={
              startDateRange?.[0] || startDateRange?.[1]
                ? [
                    startDateRange[0] ? dayjs(startDateRange[0]) : null,
                    startDateRange[1] ? dayjs(startDateRange[1]) : null,
                  ]
                : null
            }
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
      </div>
    </Card>
  )
}
