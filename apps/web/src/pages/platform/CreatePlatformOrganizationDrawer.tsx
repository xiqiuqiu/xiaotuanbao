import { Button, Drawer, Form, Input, Space, Typography } from 'antd'
import type { FormInstance } from 'antd/es/form'

export interface CreatePlatformOrganizationFormValues {
  name: string
  businessPrefix: string
  adminUsername: string
  adminName: string
  adminPassword: string
  confirmAdminPassword: string
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
        创建组织时须同时设置初始企业管理员；创建成功后该管理员可立即登录该组织后台。业务前缀创建后不可修改。
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

        <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
          初始企业管理员
        </Typography.Text>

        <Form.Item
          label="登录用户名"
          name="adminUsername"
          rules={[
            { required: true, message: '请输入登录用户名' },
            { max: 100, message: '登录用户名不能超过 100 个字符' },
          ]}
          extra="原样保存，不自动加业务前缀；请避免与其他组织使用常见同名"
        >
          <Input placeholder="例如：zhangsan" allowClear />
        </Form.Item>

        <Form.Item
          label="显示名称"
          name="adminName"
          rules={[
            { required: true, message: '请输入显示名称' },
            { max: 100, message: '显示名称不能超过 100 个字符' },
          ]}
        >
          <Input placeholder="例如：张三" allowClear />
        </Form.Item>

        <Form.Item
          label="初始密码"
          name="adminPassword"
          rules={[
            { required: true, message: '请输入初始密码' },
            { min: 8, message: '至少 8 位' },
          ]}
        >
          <Input.Password placeholder="至少 8 位" />
        </Form.Item>

        <Form.Item
          label="确认初始密码"
          name="confirmAdminPassword"
          dependencies={['adminPassword']}
          rules={[
            { required: true, message: '请再次输入密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('adminPassword') === value) {
                  return Promise.resolve()
                }
                return Promise.reject(new Error('两次输入的密码不一致'))
              },
            }),
          ]}
        >
          <Input.Password placeholder="再次输入密码" />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
