import { useEffect, useMemo } from 'react'
import { Button, DatePicker, Drawer, Form, Input, InputNumber, Space, Typography } from 'antd'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import type { DepartureDetail } from '@/types/api'
import type { ItinerarySegmentSummary } from '@/types/api'
import { computeDayCount } from '../utils/departure-wizard-form'
import {
  createDefaultSegmentFormValues,
  formValuesToPayload,
  segmentToFormValues,
  type SegmentFormValues,
} from '../utils/segment-form'

interface SegmentDrawerProps {
  open: boolean
  departure: DepartureDetail
  editing: ItinerarySegmentSummary | null
  readOnly: boolean
  loading: boolean
  onClose: () => void
  onSubmit: (values: ReturnType<typeof formValuesToPayload>) => void
}

function toDayjs(value?: string): Dayjs | null {
  return value ? dayjs(value) : null
}

function DayCountPreview({ form }: { form: ReturnType<typeof Form.useForm<SegmentFormValues>>[0] }) {
  const startDate = Form.useWatch('startDate', form)
  const endDate = Form.useWatch('endDate', form)

  if (!startDate || !endDate) {
    return null
  }

  const dayCount = computeDayCount(startDate, endDate)

  return (
    <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
      共 {dayCount} 天
    </Typography.Paragraph>
  )
}

export function SegmentDrawer({
  open,
  departure,
  editing,
  readOnly,
  loading,
  onClose,
  onSubmit,
}: SegmentDrawerProps) {
  const [form] = Form.useForm<SegmentFormValues>()

  const initialValues = useMemo(
    () =>
      editing
        ? segmentToFormValues(editing)
        : createDefaultSegmentFormValues(
            departure.startDate,
            departure.endDate,
            departure.totalGuests,
          ),
    [departure.endDate, departure.startDate, departure.totalGuests, editing],
  )

  useEffect(() => {
    if (!open) {
      return
    }

    form.resetFields()
    form.setFieldsValue(initialValues)
  }, [form, initialValues, open])

  const handleClose = () => {
    form.resetFields()
    onClose()
  }

  const handleDateChange = () => {
    const startDate = form.getFieldValue('startDate') as string | undefined
    const endDate = form.getFieldValue('endDate') as string | undefined
    if (startDate && endDate) {
      form.setFieldValue('dayCount', computeDayCount(startDate, endDate))
    }
  }

  return (
    <Drawer
      title={readOnly ? '查看行程段' : editing ? '编辑行程段' : '添加行程段'}
      width={480}
      open={open}
      onClose={handleClose}
      destroyOnClose
      footer={
        readOnly ? (
          <Button onClick={handleClose}>关闭</Button>
        ) : (
          <Space>
            <Button onClick={handleClose}>取消</Button>
            <Button
              type="primary"
              loading={loading}
              onClick={() => {
                form.validateFields().then((values) => onSubmit(formValuesToPayload(values)))
              }}
            >
              保存
            </Button>
          </Space>
        )
      }
    >
      <Form
        key={editing?.id ?? 'new'}
        form={form}
        layout="vertical"
        disabled={readOnly}
        initialValues={initialValues}
      >
        <Form.Item
          label="行程段名称"
          name="name"
          rules={[{ required: true, message: '请填写行程段名称' }]}
        >
          <Input placeholder="如喀纳斯段" />
        </Form.Item>

        <Form.Item
          label="开始日期"
          name="startDate"
          rules={[{ required: true, message: '请选择开始日期' }]}
          getValueProps={(value: string | undefined) => ({ value: toDayjs(value) })}
          getValueFromEvent={(value: Dayjs | null) => value?.format('YYYY-MM-DD')}
        >
          <DatePicker
            style={{ width: '100%' }}
            disabledDate={(current) =>
              current.isBefore(dayjs(departure.startDate), 'day') ||
              current.isAfter(dayjs(departure.endDate), 'day')
            }
            onChange={handleDateChange}
          />
        </Form.Item>

        <Form.Item
          label="结束日期"
          name="endDate"
          rules={[{ required: true, message: '请选择结束日期' }]}
          getValueProps={(value: string | undefined) => ({ value: toDayjs(value) })}
          getValueFromEvent={(value: Dayjs | null) => value?.format('YYYY-MM-DD')}
        >
          <DatePicker
            style={{ width: '100%' }}
            disabledDate={(current) =>
              current.isBefore(dayjs(departure.startDate), 'day') ||
              current.isAfter(dayjs(departure.endDate), 'day')
            }
            onChange={handleDateChange}
          />
        </Form.Item>

        <DayCountPreview form={form} />

        <Form.Item
          label="目的地"
          name="destination"
          rules={[{ required: true, message: '请填写目的地' }]}
        >
          <Input placeholder="如喀纳斯" />
        </Form.Item>

        <Form.Item
          label="适用人数"
          name="applicableGuestCount"
          rules={[{ required: true, message: '请填写适用人数' }]}
        >
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item label="备注" name="notes">
          <Input.TextArea rows={3} placeholder="特殊说明" />
        </Form.Item>

        {!readOnly ? (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            保存后请在「资源安排」中为本段添加用车、酒店、拼出等资源。
          </Typography.Paragraph>
        ) : null}
      </Form>
    </Drawer>
  )
}
