import { useEffect } from 'react'
import { Alert, Button, DatePicker, Form, Input, Popconfirm, Select, Space, Typography, message } from 'antd'
import type { FormInstance } from 'antd/es/form'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { DepartureDetail } from '@/types/api'
import { DepartureStatus } from '@xiaotuanbao/shared'
import { listEmployees } from '@/services/employee.service'
import {
  closeDeparture,
  transitionDeparture,
  updateDeparture,
} from '@/services/departure.service'
import { DEPARTURE_TYPE_OPTIONS } from '../catalog'
import { computeDayCount } from '../utils/departure-wizard-form'
import {
  departureToFormValues,
  type DepartureOverviewFormValues,
} from '../utils/departure-overview-form'

interface DepartureOverviewProps {
  departure: DepartureDetail
  form: FormInstance<DepartureOverviewFormValues>
  readOnly: boolean
  onUpdated: () => void
}

function toDayjs(value?: string): Dayjs | null {
  return value ? dayjs(value) : null
}

export function DepartureOverview({
  departure,
  form,
  readOnly,
  onUpdated,
}: DepartureOverviewProps) {
  const { data: employeesResult } = useQuery({
    queryKey: ['employees', 'departure-overview'],
    queryFn: () => listEmployees({ pageSize: 100 }),
  })

  useEffect(() => {
    form.setFieldsValue(departureToFormValues(departure))
  }, [departure, form])

  const saveMutation = useMutation({
    mutationFn: (values: DepartureOverviewFormValues) =>
      updateDeparture(departure.id, {
        departureNo: values.departureNo,
        name: values.name,
        routeName: values.routeName,
        departureType: values.departureType,
        startDate: values.startDate,
        endDate: values.endDate,
        ownerUserId: values.ownerUserId,
        notes: values.notes ?? null,
      }),
    onSuccess: () => {
      message.success('发团信息已保存')
      onUpdated()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存失败')
    },
  })

  const transitionMutation = useMutation({
    mutationFn: (targetStatus: DepartureStatus) =>
      transitionDeparture(departure.id, { targetStatus }),
    onSuccess: () => {
      message.success('状态已更新')
      onUpdated()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '状态切换失败')
    },
  })

  const closeMutation = useMutation({
    mutationFn: () => closeDeparture(departure.id),
    onSuccess: () => {
      message.success('发团已关闭')
      onUpdated()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '关闭失败')
    },
  })

  const handleStartDateChange = (value: Dayjs | null) => {
    const startDate = value?.format('YYYY-MM-DD')
    if (!startDate) {
      return
    }

    const endDate = form.getFieldValue('endDate') as string | undefined
    form.setFieldsValue({
      startDate,
      dayCount: endDate ? computeDayCount(startDate, endDate) : undefined,
    })
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

  const employeeOptions =
    employeesResult?.items.map((employee) => ({
      value: employee.id,
      label: employee.name,
    })) ?? []

  const canTransitionToPending =
    !readOnly && departure.status === DepartureStatus.EDITING
  const canTransitionToSettled =
    !readOnly &&
    departure.status === DepartureStatus.PENDING_SETTLEMENT &&
    departure.isFinanciallySettled
  const canClose =
    !readOnly && departure.status !== DepartureStatus.CLOSED

  return (
    <div>
      {canTransitionToSettled ? (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          message="全部账款已结清，可标记为已结清"
          action={
            <Popconfirm
              title="确认标记为已结清？"
              onConfirm={() => transitionMutation.mutate(DepartureStatus.SETTLED)}
            >
              <Button size="small" type="primary" loading={transitionMutation.isPending}>
                标记为已结清
              </Button>
            </Popconfirm>
          }
        />
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          基础信息
        </Typography.Title>
        <Space>
          {canTransitionToPending ? (
            <Popconfirm
              title="确认切换为待结算？"
              onConfirm={() => transitionMutation.mutate(DepartureStatus.PENDING_SETTLEMENT)}
            >
              <Button loading={transitionMutation.isPending}>切换为待结算</Button>
            </Popconfirm>
          ) : null}
          {canClose ? (
            <Popconfirm title="确认关闭发团？关闭后不可编辑。" onConfirm={() => closeMutation.mutate()}>
              <Button danger loading={closeMutation.isPending}>
                关闭发团
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      </div>

      <Form
        form={form}
        layout="vertical"
        disabled={readOnly}
        onFinish={(values) => saveMutation.mutate(values)}
      >
        <Form.Item
          name="name"
          label="团名"
          rules={[{ required: true, message: '请输入团名' }]}
        >
          <Input />
        </Form.Item>

        <Form.Item
          name="departureNo"
          label="团号"
          rules={[{ required: true, message: '请输入团号' }]}
        >
          <Input />
        </Form.Item>

        <Form.Item
          name="routeName"
          label="路线名称"
          rules={[{ required: true, message: '请输入路线名称' }]}
        >
          <Input />
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
          <DatePicker style={{ width: '100%' }} onChange={handleStartDateChange} />
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
          <DatePicker style={{ width: '100%' }} onChange={handleEndDateChange} />
        </Form.Item>

        <Form.Item name="dayCount" label="团期天数">
          <Input readOnly />
        </Form.Item>

        <Form.Item
          name="ownerUserId"
          label="发团负责人"
          rules={[{ required: true, message: '请选择负责人' }]}
        >
          <Select options={employeeOptions} showSearch optionFilterProp="label" />
        </Form.Item>

        <Form.Item name="notes" label="备注">
          <Input.TextArea rows={3} />
        </Form.Item>

        {!readOnly ? (
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={saveMutation.isPending}>
              保存
            </Button>
          </Form.Item>
        ) : null}
      </Form>
    </div>
  )
}
