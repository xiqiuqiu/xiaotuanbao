import { Form, Input, InputNumber, Modal, Typography, message } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { DepartureDetail } from '@/types/api'
import { saveRouteTemplateFromDeparture } from '@/services/route-template.service'

interface SaveAsRouteTemplateModalProps {
  departure: DepartureDetail
  open: boolean
  onClose: () => void
}

interface SaveFormValues {
  name: string
  defaultDayCount: number
}

export function SaveAsRouteTemplateModal({
  departure,
  open,
  onClose,
}: SaveAsRouteTemplateModalProps) {
  const queryClient = useQueryClient()
  const [form] = Form.useForm<SaveFormValues>()

  useEffect(() => {
    if (!open) {
      return
    }
    form.setFieldsValue({
      name: departure.routeName,
      defaultDayCount: departure.dayCount,
    })
  }, [open, departure.routeName, departure.dayCount, form])

  const saveMutation = useMutation({
    mutationFn: (values: SaveFormValues) =>
      saveRouteTemplateFromDeparture(departure.id, {
        name: values.name.trim(),
        defaultDayCount: values.defaultDayCount,
      }),
    onSuccess: () => {
      message.success('常用路线已保存，可在新建发团时选用')
      queryClient.invalidateQueries({ queryKey: ['route-templates'] })
      onClose()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存失败')
    },
  })

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      saveMutation.mutate(values)
    } catch {
      // validation errors shown by antd Form
    }
  }

  return (
    <Modal
      title="保存为常用路线"
      open={open}
      okText="保存"
      cancelText="取消"
      confirmLoading={saveMutation.isPending}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => void handleOk()}
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        常用路线仅保存行程段结构与段内资源草稿，资源金额为 0；不保存客源单、收付款节点和流水信息。
      </Typography.Paragraph>

      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="路线名称"
          rules={[{ required: true, message: '请输入路线名称' }]}
        >
          <Input placeholder="路线名称" />
        </Form.Item>

        <Form.Item
          name="defaultDayCount"
          label="默认天数"
          rules={[{ required: true, message: '请输入默认天数' }]}
        >
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
