import { Button, Drawer, Form, Input, Select, Space } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { UserStatus } from '@xiaotuanbao/shared'

interface RoleOption {
  label: string
  value: string
}

export interface EmployeeFormValues {
  username?: string
  name: string
  remark?: string
  roleId: string
  status: UserStatus
  password?: string
  confirmPassword?: string
}

interface EmployeeFormDrawerProps {
  open: boolean
  editing: boolean
  loading: boolean
  form: FormInstance<EmployeeFormValues>
  roleOptions: RoleOption[]
  onClose: () => void
  onSubmit: (values: EmployeeFormValues) => void
}

export function EmployeeFormDrawer({
  open,
  editing,
  loading,
  form,
  roleOptions,
  onClose,
  onSubmit,
}: EmployeeFormDrawerProps) {
  return (
    <Drawer
      title={editing ? '编辑员工' : '创建员工'}
      open={open}
      size={480}
      onClose={onClose}
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={loading} onClick={() => form.submit()}>
            {editing ? '保存' : '创建员工'}
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        {!editing ? (
          <Form.Item
            label="登录用户名"
            name="username"
            rules={[{ required: true, message: '请输入登录用户名' }]}
          >
            <Input placeholder="例如: xiaoli" />
          </Form.Item>
        ) : null}

        <Form.Item
          label="显示名称"
          name="name"
          rules={[{ required: true, message: '请输入显示名称' }]}
        >
          <Input placeholder="例如: 小李" />
        </Form.Item>

        <Form.Item label="备注" name="remark">
          <Input.TextArea rows={3} placeholder="内部说明（可选）" />
        </Form.Item>

        <Form.Item
          label="系统角色"
          name="roleId"
          rules={[{ required: true, message: '请选择系统角色' }]}
        >
          <Select options={roleOptions} placeholder="请选择角色" />
        </Form.Item>

        <Form.Item label="状态" name="status" rules={[{ required: true, message: '请选择状态' }]}>
          <Select
            options={[
              { label: '启用', value: UserStatus.ENABLED },
              { label: '停用', value: UserStatus.DISABLED },
            ]}
          />
        </Form.Item>

        {!editing ? (
          <>
            <Form.Item
              label="初始密码"
              name="password"
              rules={[
                { required: true, message: '请输入初始密码' },
                { min: 8, message: '至少 8 位' },
              ]}
            >
              <Input.Password placeholder="至少 8 位" />
            </Form.Item>
            <Form.Item
              label="确认初始密码"
              name="confirmPassword"
              dependencies={['password']}
              rules={[
                { required: true, message: '请再次输入密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve()
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'))
                  },
                }),
              ]}
            >
              <Input.Password placeholder="再次输入密码" />
            </Form.Item>
          </>
        ) : null}
      </Form>
    </Drawer>
  )
}
