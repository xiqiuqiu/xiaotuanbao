import { Button, Drawer, Form, Input, Space, Typography } from 'antd'
import type { FormInstance } from 'antd/es/form'

export interface CreatePlatformOrganizationFormValues {
  name: string
  businessPrefix: string
}

interface CreatePlatformOrganizationDrawerProps {
  open: boolean
  loading: boolean
  form: FormInstance<CreatePlatformOrganizationFormValues>
  onClose: () => void
  onSubmit: (values: CreatePlatformOrganizationFormValues) => void
}

export function CreatePlatformOrganizationDrawer({
  open,
  loading,
  form,
  onClose,
  onSubmit,
}: CreatePlatformOrganizationDrawerProps) {
  return (
    <Drawer
      title="创建客户 Organization"
      open={open}
      size={480}
      onClose={onClose}
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={loading} onClick={() => form.submit()}>
            创建
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        仅创建组织壳，不创建任何 User。业务前缀创建后不可修改。
      </Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item
          label="组织名称"
          name="name"
          rules={[
            { required: true, message: '请输入组织名称' },
            { max: 100, message: '组织名称不能超过 100 个字符' },
          ]}
        >
          <Input placeholder="例如：华行旅行社" allowClear />
        </Form.Item>

        <Form.Item
          label="组织业务前缀"
          name="businessPrefix"
          normalize={(value: string | undefined) =>
            typeof value === 'string' ? value.toUpperCase() : value
          }
          rules={[
            { required: true, message: '请输入组织业务前缀' },
            {
              pattern: /^[A-Z]{2,4}$/,
              message: '须为 2–4 位大写英文字母',
            },
          ]}
          extra="2–4 位大写英文字母，全平台唯一，创建后不可改"
        >
          <Input placeholder="例如：HXT" maxLength={4} allowClear />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
