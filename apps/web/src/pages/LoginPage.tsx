import { Card, Form, Input, Button, Alert, Typography } from 'antd'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { login } from '@/services/auth.service'
import { useAuthStore } from '@/app/store/auth.store'
import { AuthLayout } from '@/layouts/MainLayout'

export function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)
  const [form] = Form.useForm()

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (result) => {
      setAuth(result.accessToken, result.user)
      navigate({ to: '/' })
    },
  })

  return (
    <AuthLayout>
      <Card>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
          演示账号：admin / admin123（需先执行 pnpm db:seed）
        </Typography.Paragraph>

        {loginMutation.error ? (
          <Alert
            type="error"
            title={loginMutation.error instanceof Error ? loginMutation.error.message : '登录失败'}
            showIcon
            style={{ marginBottom: 16 }}
          />
        ) : null}

        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => loginMutation.mutate(values)}
          autoComplete="off"
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>

          <Button type="primary" htmlType="submit" block loading={loginMutation.isPending}>
            登录
          </Button>
        </Form>
      </Card>
    </AuthLayout>
  )
}
