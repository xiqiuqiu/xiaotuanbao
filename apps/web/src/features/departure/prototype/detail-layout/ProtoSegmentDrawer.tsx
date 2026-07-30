/**
 * PROTOTYPE — edit day/segment name (aligns with production SegmentDrawer name field).
 */
import { useEffect } from 'react'
import { Button, DatePicker, Drawer, Form, Input, Space } from 'antd'
import dayjs from 'dayjs'
import type { ProtoSegment } from './types'

export type ProtoSegmentDraft = {
  overview: string
  date: dayjs.Dayjs
}

type ProtoSegmentDrawerProps = {
  open: boolean
  editing: ProtoSegment | null
  onClose: () => void
  onSave: (draft: ProtoSegmentDraft) => void
}

export function ProtoSegmentDrawer({
  open,
  editing,
  onClose,
  onSave,
}: ProtoSegmentDrawerProps) {
  const [form] = Form.useForm<ProtoSegmentDraft>()

  useEffect(() => {
    if (!open || !editing) return
    form.setFieldsValue({
      overview: editing.overview,
      date: dayjs(editing.date),
    })
  }, [editing, form, open])

  return (
    <Drawer
      title={editing ? `编辑第${editing.dayIndex}天` : '编辑行程段'}
      open={open}
      size="min(420px, 100vw)"
      destroyOnHidden
      onClose={onClose}
      footer={
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            onClick={() => {
              void form.validateFields().then((values) => {
                onSave(values)
              })
            }}
          >
            保存
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <Form.Item
          name="overview"
          label="行程段名称"
          rules={[{ required: true, whitespace: true, message: '请填写行程段名称' }]}
          extra="显示在日程卡上，如「天山天池」「魔鬼城 / 返乌」"
        >
          <Input placeholder="如天山天池、魔鬼城 / 返乌" maxLength={40} showCount />
        </Form.Item>
        <Form.Item
          name="date"
          label="日期"
          rules={[{ required: true, message: '请选择日期' }]}
        >
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
