import { Button, Drawer, Form, Input, Space, Typography } from 'antd'
import type { FormInstance } from 'antd/es/form'

export interface UpdatePlatformOrganizationBusinessPrefixFormValues {
  businessPrefix: string
}

interface UpdatePlatformOrganizationBusinessPrefixDrawerProps {
  open: boolean
  loading: boolean
  currentBusinessPrefix: string
  form: FormInstance<UpdatePlatformOrganizationBusinessPrefixFormValues>
  onClose: () => void
  onSubmit: (values: UpdatePlatformOrganizationBusinessPrefixFormValues) => void
}

export function UpdatePlatformOrganizationBusinessPrefixDrawer({
  open,
  loading,
  currentBusinessPrefix,
  form,
  onClose,
  onSubmit,
}: UpdatePlatformOrganizationBusinessPrefixDrawerProps) {
  return (
    <Drawer
      title="修改业务前缀"
      open={open}
      size={480}
      onClose={onClose}
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={loading} onClick={() => form.submit()}>
            保存
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        当前前缀：{currentBusinessPrefix}。修改后仅影响<strong>新</strong>
        生成的发团、财务等业务编号；已分配编号不会改写。
      </Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item
          label="组织业务前缀"
          name="businessPrefix"
          normalize={(value) => (typeof value === 'string' ? value.trim().toUpperCase() : value)}
          rules={[
            { required: true, message: '请输入组织业务前缀' },
            {
              pattern: /^[A-Z]{1,4}$/,
              message: '组织业务前缀须为 1–4 位大写英文字母',
            },
          ]}
        >
          <Input placeholder="例如：X" maxLength={4} allowClear />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
