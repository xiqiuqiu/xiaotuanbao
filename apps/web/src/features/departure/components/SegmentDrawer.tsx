import { useEffect, useMemo } from 'react'
import {
  Alert,
  Button,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Space,
  Typography,
  message,
  theme,
} from 'antd'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import type { DepartureDetail } from '@/types/api'
import type { ItinerarySegmentSummary } from '@/types/api'
import {
  createDefaultSegmentFormValues,
  formValuesToPayload,
  segmentToFormValues,
  type SegmentFormValues,
} from '../utils/segment-form'
import {
  formatTicketHeadcountMismatchMessage,
  hasTicketHeadcountMismatch,
} from '../utils/ticket-type-headcount'

interface SegmentDrawerProps {
  open: boolean
  departure: DepartureDetail
  editing: ItinerarySegmentSummary | null
  readOnly: boolean
  loading: boolean
  deleting?: boolean
  onClose: () => void
  onSubmit: (values: ReturnType<typeof formValuesToPayload>) => void
  onDelete?: () => void
}

function toDayjs(value?: string): Dayjs | null {
  return value ? dayjs(value) : null
}

function TicketCountField({
  name,
  label,
}: {
  name: keyof Pick<
    SegmentFormValues,
    'fullTicketCount' | 'halfTicketCount' | 'studentTicketCount' | 'freeTicketCount'
  >
  label: string
}) {
  return (
    <Form.Item
      label={label}
      name={name}
      rules={[
        {
          type: 'number',
          min: 0,
          message: '须为非负整数',
          transform: (value) => value,
        },
      ]}
    >
      <InputNumber min={0} precision={0} step={1} style={{ width: '100%' }} placeholder="0" />
    </Form.Item>
  )
}

export function SegmentDrawer({
  open,
  departure,
  editing,
  readOnly,
  loading,
  deleting = false,
  onClose,
  onSubmit,
  onDelete,
}: SegmentDrawerProps) {
  const { token } = theme.useToken()
  const [form] = Form.useForm<SegmentFormValues>()
  const showDelete = Boolean(editing) && !readOnly && Boolean(onDelete)
  const canDelete = showDelete && (editing?.resourceCount ?? 0) === 0

  const initialValues = useMemo(
    () => (editing ? segmentToFormValues(editing) : createDefaultSegmentFormValues()),
    [editing],
  )

  const watchedTicketCounts = Form.useWatch(
    ['fullTicketCount', 'halfTicketCount', 'studentTicketCount', 'freeTicketCount'],
    form,
  )

  const ticketCounts = useMemo(() => {
    const values = Array.isArray(watchedTicketCounts) ? watchedTicketCounts : []
    return {
      fullTicketCount: Number(values[0] ?? initialValues.fullTicketCount ?? 0),
      halfTicketCount: Number(values[1] ?? initialValues.halfTicketCount ?? 0),
      studentTicketCount: Number(values[2] ?? initialValues.studentTicketCount ?? 0),
      freeTicketCount: Number(values[3] ?? initialValues.freeTicketCount ?? 0),
    }
  }, [initialValues, watchedTicketCounts])

  const sourceGuestTotal = departure.totalGuests
  const showMismatch = hasTicketHeadcountMismatch(ticketCounts, sourceGuestTotal)

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

  const validateDatePair = () => {
    const startDate = form.getFieldValue('startDate') as string | undefined
    const endDate = form.getFieldValue('endDate') as string | undefined

    if (!startDate && !endDate) {
      return Promise.resolve()
    }

    if (!startDate || !endDate) {
      return Promise.reject(new Error('开始日期与结束日期须同时填写或同时清空'))
    }

    if (endDate < startDate) {
      return Promise.reject(new Error('结束日期不能早于开始日期'))
    }

    return Promise.resolve()
  }

  return (
    <Drawer
      title={readOnly ? '查看行程段' : editing ? '编辑行程段' : '添加行程段'}
      size="min(480px, 100vw)"
      open={open}
      onClose={handleClose}
      destroyOnHidden
      styles={{ footer: { paddingBlock: token.paddingMD } }}
      footer={
        readOnly ? (
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={handleClose}>关闭</Button>
          </Space>
        ) : (
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            {showDelete ? (
              canDelete ? (
                <Popconfirm
                  title="确定删除该行程段？"
                  onConfirm={onDelete}
                  okButtonProps={{ loading: deleting, danger: true }}
                >
                  <Button danger loading={deleting}>
                    删除
                  </Button>
                </Popconfirm>
              ) : (
                <Button
                  danger
                  onClick={() => message.error('当前行程段已有资源，不能删除')}
                >
                  删除
                </Button>
              )
            ) : null}
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
      {showMismatch ? (
        <Alert
          type="warning"
          showIcon
          title="票型人数与客源人数不一致"
          description={formatTicketHeadcountMismatchMessage(ticketCounts, sourceGuestTotal)}
          style={{ marginBottom: token.marginMD }}
        />
      ) : null}

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
          rules={[{ required: true, whitespace: true, message: '请填写行程段名称' }]}
        >
          <Input placeholder="如喀纳斯段" />
        </Form.Item>

        <Form.Item
          label="开始日期"
          name="startDate"
          dependencies={['endDate']}
          rules={[{ validator: validateDatePair }]}
          getValueProps={(value: string | undefined) => ({ value: toDayjs(value) })}
          getValueFromEvent={(value: Dayjs | null) => value?.format('YYYY-MM-DD')}
        >
          <DatePicker
            style={{ width: '100%' }}
            allowClear
            disabledDate={(current) =>
              current.isBefore(dayjs(departure.startDate), 'day') ||
              current.isAfter(dayjs(departure.endDate), 'day')
            }
          />
        </Form.Item>

        <Form.Item
          label="结束日期"
          name="endDate"
          dependencies={['startDate']}
          rules={[{ validator: validateDatePair }]}
          getValueProps={(value: string | undefined) => ({ value: toDayjs(value) })}
          getValueFromEvent={(value: Dayjs | null) => value?.format('YYYY-MM-DD')}
        >
          <DatePicker
            style={{ width: '100%' }}
            allowClear
            disabledDate={(current) =>
              current.isBefore(dayjs(departure.startDate), 'day') ||
              current.isAfter(dayjs(departure.endDate), 'day')
            }
          />
        </Form.Item>

        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: token.marginXS }}>
          票型人数
        </Typography.Text>
        <Row gutter={token.marginSM}>
          <Col span={6}>
            <TicketCountField name="fullTicketCount" label="全" />
          </Col>
          <Col span={6}>
            <TicketCountField name="halfTicketCount" label="半" />
          </Col>
          <Col span={6}>
            <TicketCountField name="studentTicketCount" label="学" />
          </Col>
          <Col span={6}>
            <TicketCountField name="freeTicketCount" label="免" />
          </Col>
        </Row>

        <Form.Item label="备注" name="notes">
          <Input.TextArea rows={3} placeholder="特殊说明" />
        </Form.Item>

        {!readOnly && !editing ? (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            保存后请在本段「资源安排」中添加用车、酒店、拼出等资源。
          </Typography.Paragraph>
        ) : null}
      </Form>
    </Drawer>
  )
}
