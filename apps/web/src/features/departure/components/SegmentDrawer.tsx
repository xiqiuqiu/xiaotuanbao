import { useEffect, useMemo } from 'react'
import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  Popconfirm,
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

  return (
    <Drawer
      title={readOnly ? '查看行程' : editing ? '编辑行程' : '添加行程'}
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
                  title="确定删除该行程？"
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
                  onClick={() => message.error('当前行程已有资源，不能删除')}
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
                form.validateFields().then((values) =>
                  onSubmit(
                    formValuesToPayload({
                      ...initialValues,
                      ...values,
                    }),
                  ),
                )
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
          label="行程名称"
          name="name"
          rules={[{ required: true, whitespace: true, message: '请填写行程名称' }]}
        >
          <Input placeholder="如喀纳斯段" />
        </Form.Item>

        <Form.Item
          label="日期"
          name="startDate"
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
