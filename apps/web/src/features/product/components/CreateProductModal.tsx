import { Button, Form, Input, Modal, Space, message } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createProduct } from '@/services/product.service'
import { useNavigate } from '@tanstack/react-router'

interface CreateProductModalProps {
  open: boolean
  onClose: () => void
}

interface FormValues {
  name: string
  shortItinerary?: string
}

export function CreateProductModal({ open, onClose }: CreateProductModalProps) {
  const [form] = Form.useForm<FormValues>()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: createProduct,
    onSuccess: (product) => {
      message.success('产品已创建')
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      onClose()
      form.resetFields()
      void navigate({ to: '/product/$productId', params: { productId: product.id } })
    },
    onError: (error: Error) => {
      message.error(error.message || '创建失败')
    },
  })

  return (
    <Modal
      title="新建产品"
      open={open}
      onCancel={() => {
        onClose()
        form.resetFields()
      }}
      footer={null}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => mutation.mutate(values)}
      >
        <Form.Item
          name="name"
          label="产品名称"
          rules={[{ required: true, message: '请输入产品名称' }]}
        >
          <Input placeholder="如：北疆大巴纯玩经典线" maxLength={120} />
        </Form.Item>
        <Form.Item name="shortItinerary" label="简版行程">
          <Input.TextArea rows={4} placeholder="可先粘贴 Excel 简版行程，稍后完善" />
        </Form.Item>
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" htmlType="submit" loading={mutation.isPending}>
            创建
          </Button>
        </Space>
      </Form>
    </Modal>
  )
}
