import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Empty, Select, Space, Typography } from 'antd'
import { listDepartureRouteNames } from '@/services/departure.service'

type RouteLedgerViewPanelProps = {
  onSwitchToDepartureList: () => void
}

/**
 * 线路视图壳（#182）：
 * - 须先精确选定一条发团 `routeName`；
 * - 未选时为空态；选中后本票仅占位，账本明细由后续票承接。
 */
export function RouteLedgerViewPanel({ onSwitchToDepartureList }: RouteLedgerViewPanelProps) {
  const [routeName, setRouteName] = useState<string | undefined>()

  const { data, isLoading } = useQuery({
    queryKey: ['departures', 'route-names'],
    queryFn: ({ signal }) => listDepartureRouteNames(signal),
  })

  const options =
    data?.items.map((name) => ({
      value: name,
      label: name,
    })) ?? []

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Select
        showSearch
        allowClear
        virtual={false}
        placeholder="选择路线名称"
        aria-label="路线名称"
        style={{ width: 320 }}
        loading={isLoading}
        options={options}
        value={routeName}
        optionFilterProp="label"
        onChange={(value) => setRouteName(value)}
      />

      {routeName ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Typography.Text type="secondary">
              「{routeName}」的账本明细将在后续版本提供
            </Typography.Text>
          }
          style={{ padding: '48px 0' }}
        >
          <Space>
            <Button onClick={() => setRouteName(undefined)}>重新选择路线</Button>
            <Button type="link" onClick={onSwitchToDepartureList}>
              返回发团视图
            </Button>
          </Space>
        </Empty>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Space orientation="vertical" size={4}>
              <Typography.Text>请先选择路线名称</Typography.Text>
              <Typography.Text type="secondary">
                线路视图需先选定一条路线，再按出团日查看该线下客源流水
              </Typography.Text>
            </Space>
          }
          style={{ padding: '48px 0' }}
        />
      )}
    </Space>
  )
}
