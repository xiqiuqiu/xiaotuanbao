import { Button, DatePicker, Drawer, Form, Input, Select, Space, message } from 'antd'
import type { FormInstance } from 'antd/es/form'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DepartureDetail } from '@/types/api'
import { listEmployeeOptions } from '@/services/employee.service'
import { updateDeparture } from '@/services/departure.service'
import { DEPARTURE_TYPE_OPTIONS } from '../catalog'
import { computeDayCount } from '../utils/departure-wizard-form'
import {
  departureToFormValues,
  type DepartureOverviewFormValues,
} from '../utils/departure-overview-form'

interface DepartureOverviewDrawerProps {
  open: boolean
  departure: DepartureDetail
  form: FormInstance<DepartureOverviewFormValues>
  onClose: () => void
  onUpdated: () => void
}

function toDayjs(value?: string): Dayjs | null {
  return value ? dayjs(value) : null
}

export function DepartureOverviewDrawer({
  open,
  departure,
  form,
  onClose,
  onUpdated,
}: DepartureOverviewDrawerProps) {
  const queryClient = useQueryClient()
  const { data: employeeOptionsResult } = useQuery({
    queryKey: ['employees', 'options', 'departure-overview'],
    queryFn: () => listEmployeeOptions(),
  })

  const saveMutation = useMutation({
    mutationFn: (values: DepartureOverviewFormValues) =>
      updateDeparture(departure.id, {
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
      void queryClient.invalidateQueries({ queryKey: ['departure', departure.id] })
      void queryClient.invalidateQueries({ queryKey: ['departures'] })
      onUpdated()
      onClose()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存失败')
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
    employeeOptionsResult?.map((employee) => ({
      value: employee.id,
      label: employee.name,
    })) ?? []

  const handleClose = () => {
    form.resetFields()
    onClose()
  }

  return (
    <Drawer
      title="编辑基础信息"
      open={open}
      width="min(520px, 100vw)"
      onClose={handleClose}
      destroyOnHidden
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={handleClose}>取消</Button>
          <Button
            type="primary"
            loading={saveMutation.isPending}
            onClick={() => form.submit()}
          >
            保存
          </Button>
        </Space>
      }
    >
      <Form
        key={`${departure.id}-${departure.updatedAt}`}
        form={form}
        layout="vertical"
        initialValues={departureToFormValues(departure)}
        onFinish={(values) => saveMutation.mutate(values)}
      >
        <Form.Item
          name="name"
          label="团名"
          rules={[{ required: true, message: '请输入团名' }]}
        >
          <Input />
        </Form.Item>

        <Form.Item name="departureNo" label="团号">
          <Input readOnly />
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
      </Form>
    </Drawer>
  )
}
