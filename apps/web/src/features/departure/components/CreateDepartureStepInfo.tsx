import { CalendarOutlined, CopyOutlined, FileTextOutlined } from '@ant-design/icons'
import { Card, Col, DatePicker, Form, Input, Row, Select, Space, Typography, theme } from 'antd'
import type { CSSProperties } from 'react'
import type { FormInstance } from 'antd/es/form'
import { useQuery } from '@tanstack/react-query'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { listEmployeeOptions } from '@/services/employee.service'
import { DEPARTURE_TYPE_OPTIONS } from '../catalog'
import type { InfoFormValues, RouteStepValues } from '../utils/departure-wizard-form'
import {
  buildDefaultDepartureName,
  buildRouteSummary,
  computeDayCount,
  computeEndDateFromDefaultDays,
} from '../utils/departure-wizard-form'
import styles from './CreateDepartureStepInfo.module.css'

interface CreateDepartureStepInfoProps {
  form: FormInstance<InfoFormValues>
  route: RouteStepValues
}

function toDayjs(value?: string): Dayjs | null {
  return value ? dayjs(value) : null
}

export function CreateDepartureStepInfo({ form, route }: CreateDepartureStepInfoProps) {
  const { token } = theme.useToken()
  const defaultDayCount = route.defaultDayCount
  const copySummary = buildRouteSummary(route)
  const { data: employeeOptionsResult } = useQuery({
    queryKey: ['employees', 'options', 'create-departure'],
    queryFn: () => listEmployeeOptions(),
  })

  const employeeOptions =
    employeeOptionsResult?.map((employee) => ({
      value: employee.id,
      label: employee.name,
    })) ?? []

  const handleStartDateChange = (value: Dayjs | null) => {
    const startDate = value?.format('YYYY-MM-DD')
    if (!startDate) return

    const updates: Partial<InfoFormValues> = { startDate }
    const routeName = route.routeName.trim()
    if (routeName) updates.name = buildDefaultDepartureName(routeName, startDate)

    if (defaultDayCount && defaultDayCount > 0) {
      updates.endDate = computeEndDateFromDefaultDays(startDate, defaultDayCount)
      updates.dayCount = defaultDayCount
    } else {
      const currentEndDate = form.getFieldValue('endDate') as string | undefined
      if (currentEndDate) updates.dayCount = computeDayCount(startDate, currentEndDate)
    }

    form.setFieldsValue(updates)
  }

  const handleEndDateChange = (value: Dayjs | null) => {
    const endDate = value?.format('YYYY-MM-DD')
    if (!endDate) return

    const startDate = form.getFieldValue('startDate') as string | undefined
    form.setFieldsValue({
      endDate,
      dayCount: startDate ? computeDayCount(startDate, endDate) : undefined,
    })
  }

  return (
    <div
      style={
        {
          '--info-fill': token.colorFillAlter,
          '--info-border': token.colorBorderSecondary,
          '--info-radius': `${token.borderRadius}px`,
          '--info-secondary': token.colorTextSecondary,
        } as CSSProperties
      }
    >
      <Row gutter={[32, 24]}>
      <Col xs={24} xl={16}>
        <div className={styles.sectionHeader}>
          <Typography.Title level={5}>发团基础信息</Typography.Title>
          <Typography.Paragraph type="secondary">
            团名和结束日期已按所选路线生成，可根据本次实际团期调整。
          </Typography.Paragraph>
        </div>

        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={16}>
              <Form.Item
                name="name"
                label="团名"
                rules={[{ required: true, message: '请输入团名' }]}
              >
                <Input placeholder="路线名称 + 出团日期" />
              </Form.Item>
            </Col>

            <Col xs={24} md={8}>
              <Form.Item name="departureNo" label="团号">
                <Input readOnly placeholder="系统自动分配" />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                name="departureType"
                label="发团类型"
                rules={[{ required: true, message: '请选择发团类型' }]}
              >
                <Select options={[...DEPARTURE_TYPE_OPTIONS]} />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                name="ownerUserId"
                label="负责人"
                rules={[{ required: true, message: '请选择负责人' }]}
              >
                <Select
                  showSearch={{ optionFilterProp: 'label' }}
                  options={employeeOptions}
                  placeholder="选择负责人"
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={10}>
              <Form.Item
                name="startDate"
                label="出团日期"
                rules={[{ required: true, message: '请选择出团日期' }]}
                getValueProps={(value: string | undefined) => ({ value: toDayjs(value) })}
              >
                <DatePicker className={styles.fullWidth} onChange={handleStartDateChange} />
              </Form.Item>
            </Col>

            <Col xs={24} md={10}>
              <Form.Item
                name="endDate"
                label="结束日期"
                rules={[{ required: true, message: '请选择结束日期' }]}
                getValueProps={(value: string | undefined) => ({ value: toDayjs(value) })}
              >
                <DatePicker className={styles.fullWidth} onChange={handleEndDateChange} />
              </Form.Item>
            </Col>

            <Col xs={24} md={4}>
              <Form.Item name="dayCount" label="天数">
                <Input readOnly />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item name="notes" label="备注">
                <Input.TextArea rows={3} placeholder="可选" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Col>

      <Col xs={24} xl={8}>
        <Card size="small" title="本次发团摘要" className={styles.summaryCard}>
          <Space orientation="vertical" size={16} className={styles.summaryContent}>
            <div>
              <Typography.Text type="secondary">所选路线</Typography.Text>
              <Typography.Title level={5} className={styles.routeName}>
                {route.routeName || '-'}
              </Typography.Title>
            </div>

            <Space orientation="vertical" size={12}>
              <Typography.Text>
                <CalendarOutlined className={styles.summaryIcon} />
                默认 {route.defaultDayCount ? `${route.defaultDayCount} 天` : '未设置天数'}
              </Typography.Text>
              {route.mode === 'template' ? (
                <Typography.Text>
                  <FileTextOutlined className={styles.summaryIcon} />
                  路线内容将在创建后带入
                </Typography.Text>
              ) : null}
              {route.mode === 'copy' ? (
                <Typography.Text>
                  <CopyOutlined className={styles.summaryIcon} />
                  复制已有发团的行程与资源
                </Typography.Text>
              ) : null}
            </Space>

            {copySummary ? (
              <div className={styles.copySummary}>
                <Typography.Text type="secondary">{copySummary}</Typography.Text>
              </div>
            ) : null}

            <Typography.Text type="secondary" className={styles.numberHint}>
              团号由系统按创建年月自动分配，创建后不可修改。
            </Typography.Text>
          </Space>
        </Card>
      </Col>
      </Row>
    </div>
  )
}
