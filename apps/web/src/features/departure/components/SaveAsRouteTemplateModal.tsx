import { Checkbox, Form, Input, InputNumber, Modal, Space, Tooltip, Typography, message } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
  copySegments: boolean
  copyResources: boolean
  copyReferencePrices: boolean
}

export function SaveAsRouteTemplateModal({
  departure,
  open,
  onClose,
}: SaveAsRouteTemplateModalProps) {
  const queryClient = useQueryClient()
  const [form] = Form.useForm<SaveFormValues>()

  const resetForm = () => {
    form.setFieldsValue({
      name: departure.routeName,
      defaultDayCount: departure.dayCount,
      copySegments: true,
      copyResources: true,
      copyReferencePrices: true,
    })
  }

  const saveMutation = useMutation({
    mutationFn: (values: SaveFormValues) =>
      saveRouteTemplateFromDeparture(departure.id, {
        name: values.name.trim(),
        defaultDayCount: values.defaultDayCount,
        copySegments: values.copySegments,
        copyResources: values.copyResources,
        copyReferencePrices: values.copyReferencePrices,
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
      onCancel={onClose}
      onOk={() => void handleOk()}
      afterOpenChange={(isOpen) => {
        if (isOpen) {
          resetForm()
        }
      }}
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        常用路线仅保存路线、行程段、资源配置和参考价格，不保存客源单、收付款节点和流水信息。
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

        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Form.Item name="copySegments" valuePropName="checked" noStyle>
            <Checkbox>保存行程段</Checkbox>
          </Form.Item>
          <Form.Item name="copyResources" valuePropName="checked" noStyle>
            <Checkbox>保存资源配置</Checkbox>
          </Form.Item>
          <Form.Item name="copyReferencePrices" valuePropName="checked" noStyle>
            <Checkbox>保存参考价格</Checkbox>
          </Form.Item>
          <Tooltip title="客源每次不同，不能保存到常用路线">
            <Checkbox disabled checked={false}>
              保存客源信息
            </Checkbox>
          </Tooltip>
          <Tooltip title="收付款节点不能保存到常用路线">
            <Checkbox disabled checked={false}>
              保存应收应付
            </Checkbox>
          </Tooltip>
          <Tooltip title="流水核销不能保存到常用路线">
            <Checkbox disabled checked={false}>
              保存流水核销
            </Checkbox>
          </Tooltip>
        </Space>
      </Form>
    </Modal>
  )
}
