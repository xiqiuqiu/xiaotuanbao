import { Button, Drawer, Form, Input, Space, Typography } from 'antd'
import type { FormInstance } from 'antd/es/form'

export interface RenamePlatformOrganizationFormValues {
  name: string
}

interface RenamePlatformOrganizationDrawerProps {
  open: boolean
  loading: boolean
  businessPrefix: string
  form: FormInstance<RenamePlatformOrganizationFormValues>
  onClose: () => void
  onSubmit: (values: RenamePlatformOrganizationFormValues) => void
}

export function RenamePlatformOrganizationDrawer({
  open,
  loading,
  businessPrefix,
  form,
  onClose,
  onSubmit,
}: RenamePlatformOrganizationDrawerProps) {
  return (
    <Drawer
      title="修改组织名称"
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
        仅可修改组织名称。业务前缀创建后不可修改（当前：{businessPrefix}）。
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
      </Form>
    </Drawer>
  )
}
