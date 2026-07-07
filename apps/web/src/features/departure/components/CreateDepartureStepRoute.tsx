import { Empty, Form, Input, InputNumber, Tabs } from 'antd'
import type { RouteStepValues } from '../utils/departure-wizard-form'

interface CreateDepartureStepRouteProps {
  values: RouteStepValues
  onChange: (values: RouteStepValues) => void
}

export function CreateDepartureStepRoute({ values, onChange }: CreateDepartureStepRouteProps) {
  return (
    <Tabs
      defaultActiveKey="manual"
      items={[
        {
          key: 'manual',
          label: '手动输入',
          children: (
            <Form layout="vertical" style={{ maxWidth: 480 }}>
              <Form.Item label="路线名称" required>
                <Input
                  placeholder="如：喀纳斯阿勒泰10日线"
                  value={values.routeName}
                  onChange={(event) =>
                    onChange({ ...values, routeName: event.target.value })
                  }
                />
              </Form.Item>
              <Form.Item label="默认天数" extra="可选，用于 Step 2 自动计算结束日期">
                <InputNumber
                  min={1}
                  max={365}
                  placeholder="如：10"
                  style={{ width: '100%' }}
                  value={values.defaultDayCount}
                  onChange={(value) =>
                    onChange({
                      ...values,
                      defaultDayCount: value ?? undefined,
                    })
                  }
                />
              </Form.Item>
            </Form>
          ),
        },
        {
          key: 'template',
          label: '常用路线',
          disabled: true,
          children: (
            <Empty
              description="常用路线将在后续迭代中提供"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ),
        },
      ]}
    />
  )
}
