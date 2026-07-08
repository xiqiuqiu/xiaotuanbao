import { Card, Col, DatePicker, Form, Input, Row, Select, Typography } from 'antd'
import type { FormInstance } from 'antd/es/form'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useQuery } from '@tanstack/react-query'
import { listEmployees } from '@/services/employee.service'
import { DEPARTURE_TYPE_OPTIONS } from '../catalog'
import type { InfoFormValues, RouteStepValues } from '../utils/departure-wizard-form'
import {
  buildDefaultDepartureName,
  buildRouteSummary,
  computeDayCount,
  computeEndDateFromDefaultDays,
} from '../utils/departure-wizard-form'

interface CreateDepartureStepInfoProps {
  form: FormInstance<InfoFormValues>
  route: RouteStepValues
}

function toDayjs(value?: string): Dayjs | null {
  return value ? dayjs(value) : null
}

export function CreateDepartureStepInfo({
  form,
  route,
}: CreateDepartureStepInfoProps) {
  const defaultDayCount = route.defaultDayCount
  const copySummary = buildRouteSummary(route)
  const { data: employeesResult } = useQuery({
    queryKey: ['employees', 'create-departure'],
    queryFn: () => listEmployees({ pageSize: 100 }),
  })

  const employeeOptions =
    employeesResult?.items.map((employee) => ({
      value: employee.id,
      label: employee.name,
    })) ?? []

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

          <Form.Item name="departureNo" label="团号">
            <Input readOnly placeholder="系统自动分配" />
          </Form.Item>
          <Typography.Paragraph type="secondary" style={{ marginTop: -16 }}>
            团号由系统按创建年月自动分配，创建后不可修改。
          </Typography.Paragraph>

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
          >
            <DatePicker style={{ width: '100%' }} onChange={handleStartDateChange} />
          </Form.Item>

          <Form.Item
            name="endDate"
            label="结束日期"
            rules={[{ required: true, message: '请选择结束日期' }]}
            getValueProps={(value: string | undefined) => ({ value: toDayjs(value) })}
          >
            <DatePicker style={{ width: '100%' }} onChange={handleEndDateChange} />
          </Form.Item>

          <Form.Item name="dayCount" label="天数">
            <Input readOnly />
          </Form.Item>

          <Form.Item
            name="ownerUserId"
            label="负责人"
            rules={[{ required: true, message: '请选择负责人' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={employeeOptions}
              placeholder="选择负责人"
            />
          </Form.Item>

          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} placeholder="可选" />
          </Form.Item>
        </Form>
      </Col>

      <Col xs={24} lg={8}>
        <Card size="small" title="路线摘要">
          {copySummary ? <Typography.Text type="secondary">{copySummary}</Typography.Text> : null}
        </Card>
      </Col>
    </Row>
  )
}
