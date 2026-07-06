import { Card, Form, Input, Button, Alert, Typography } from 'antd'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { login } from '@/services/auth.service'
import { useAuthStore } from '@/app/store/auth.store'
import { AuthLayout } from '@/layouts/MainLayout'
import { queryClient } from '@/lib/query/client'

export function LoginPage() {
  const navigate = useNavigate()
  const setSession = useAuthStore((state) => state.setSession)
  const [form] = Form.useForm()

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (result) => {
      setSession(result.accessToken, result.user, result.menuKeys)
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      queryClient.invalidateQueries({ queryKey: ['organization'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
      navigate({ to: '/' })
    },
  })

  return (
    <AuthLayout>
      <Card>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
          演示账号：admin / admin123（企业管理员）；wangjie / admin123（计调）；acai / admin123（财务）
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
