import { ReloadOutlined } from '@ant-design/icons'
import { Button, Card, Col, DatePicker, Form, Input, Row, Select, Space, Typography } from 'antd'
import type { FormInstance } from 'antd/es/form'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { DepartureType } from '@xiaotuanbao/shared'
import { DEPARTURE_TYPE_OPTIONS } from '../catalog'
import type { InfoStepValues, RouteStepValues } from '../utils/departure-wizard-form'
import {
  buildDefaultDepartureName,
  buildRouteSummary,
  computeDayCount,
  computeEndDateFromDefaultDays,
} from '../utils/departure-wizard-form'

export type InfoFormValues = InfoStepValues & {
  dayCount: number
  ownerName: string
}

interface CreateDepartureStepInfoProps {
  form: FormInstance<InfoFormValues>
  route: RouteStepValues
  regeneratingNo: boolean
  onRegenerateDepartureNo: () => void
}

function toDayjs(value?: string): Dayjs | null {
  return value ? dayjs(value) : null
}

export function CreateDepartureStepInfo({
  form,
  route,
  regeneratingNo,
  onRegenerateDepartureNo,
}: CreateDepartureStepInfoProps) {
  const defaultDayCount = route.defaultDayCount
  const copySummary = buildRouteSummary(route)

  const handleStartDateChange = (value: Dayjs | null) => {
    const startDate = value?.format('YYYY-MM-DD')
    if (!startDate) {
      return
    }

    const updates: Partial<InfoFormValues> = { startDate }
    const routeName = route.routeName.trim()
    if (routeName) {
      updates.name = buildDefaultDepartureName(routeName, startDate)
    }

    if (defaultDayCount && defaultDayCount > 0) {
      const endDate = computeEndDateFromDefaultDays(startDate, defaultDayCount)
      updates.endDate = endDate
      updates.dayCount = defaultDayCount
    } else {
      const currentEndDate = form.getFieldValue('endDate') as string | undefined
      if (currentEndDate) {
        updates.dayCount = computeDayCount(startDate, currentEndDate)
      }
    }

    form.setFieldsValue(updates)
  }

  const handleEndDateChange = (value: Dayjs | null) => {
    const endDate = value?.format('YYYY-MM-DD')
    if (!endDate) {
      return
    }

    const startDate = form.getFieldValue('startDate') as string | undefined
    form.setFieldsValue({
      endDate,
      dayCount: startDate ? computeDayCount(startDate, endDate) : undefined,
    })
  }

  return (
    <Row gutter={24}>
      <Col xs={24} lg={16}>
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="团名"
            rules={[{ required: true, message: '请输入团名' }]}
          >
            <Input placeholder="路线名称 + 出团日期" />
          </Form.Item>

          <Form.Item label="团号" required>
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item
                name="departureNo"
                noStyle
                rules={[{ required: true, message: '请输入团号' }]}
              >
                <Input placeholder="自动生成" />
              </Form.Item>
              <Button
                icon={<ReloadOutlined />}
                loading={regeneratingNo}
                onClick={onRegenerateDepartureNo}
              >
                重新生成
              </Button>
            </Space.Compact>
          </Form.Item>

          <Form.Item
            name="departureType"
            label="发团类型"
            rules={[{ required: true, message: '请选择发团类型' }]}
          >
            <Select options={[...DEPARTURE_TYPE_OPTIONS]} />
          </Form.Item>

          <Form.Item
            name="startDate"
            label="出团日期"
            rules={[{ required: true, message: '请选择出团日期' }]}
            getValueProps={(value: string | undefined) => ({ value: toDayjs(value) })}
            getValueFromEvent={(value: Dayjs | null) => value?.format('YYYY-MM-DD')}
          >
            <DatePicker
              style={{ width: '100%' }}
              onChange={handleStartDateChange}
            />
          </Form.Item>

          <Form.Item
            name="endDate"
            label="结束日期"
            dependencies={['startDate']}
            rules={[
              { required: true, message: '请选择结束日期' },
              ({ getFieldValue }) => ({
                validator(_, value: string | undefined) {
                  const startDate = getFieldValue('startDate') as string | undefined
                  if (!startDate || !value || value >= startDate) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('结束日期不能早于出团日期'))
                },
              }),
            ]}
            getValueProps={(value: string | undefined) => ({ value: toDayjs(value) })}
            getValueFromEvent={(value: Dayjs | null) => value?.format('YYYY-MM-DD')}
          >
            <DatePicker
              style={{ width: '100%' }}
              onChange={handleEndDateChange}
            />
          </Form.Item>

          <Form.Item name="dayCount" label="团期天数">
            <Input readOnly />
          </Form.Item>

          <Form.Item name="ownerName" label="发团负责人">
            <Input readOnly />
          </Form.Item>
          <Form.Item name="ownerUserId" hidden>
            <Input />
          </Form.Item>

          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} placeholder="特殊说明（可选）" />
          </Form.Item>
        </Form>
      </Col>

      <Col xs={24} lg={8}>
        <Card title={route.mode === 'copy' ? '复制来源' : '已选路线'} size="small">
          <Typography.Paragraph strong style={{ marginBottom: 8 }}>
            {route.routeName || '—'}
          </Typography.Paragraph>
          <Typography.Text type="secondary">
            {route.defaultDayCount ? `默认 ${route.defaultDayCount} 天` : '未设置默认天数'}
          </Typography.Text>
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            {copySummary ?? '无模板复制项'}
          </Typography.Paragraph>
        </Card>
      </Col>
    </Row>
  )
}

export function createInfoFormValues(
  route: RouteStepValues,
  ownerUserId: string,
  ownerName: string,
  startDate: string,
  departureNo: string,
): InfoFormValues {
  const endDate =
    route.defaultDayCount && route.defaultDayCount > 0
      ? computeEndDateFromDefaultDays(startDate, route.defaultDayCount)
      : startDate

  return {
    name: buildDefaultDepartureName(route.routeName, startDate),
    departureNo,
    departureType: DepartureType.COMBINED,
    startDate,
    endDate,
    dayCount: computeDayCount(startDate, endDate),
    ownerUserId,
    ownerName,
    notes: undefined,
  }
}
