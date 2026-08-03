import { useEffect, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Flex,
  Form,
  Input,
  Row,
  Col,
  Typography,
  theme,
} from 'antd'
import {
  AccountBookOutlined,
  ClusterOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  ScheduleOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { login } from '@/services/auth.service'
import { useAuthStore } from '@/app/store/auth.store'
import { env } from '@/config/env'
import { resolvePostLoginDestination } from '@/lib/auth/session'
import { queryClient } from '@/lib/query/client'
import styles from './LoginPage.module.css'

const REMEMBER_USERNAME_KEY = 'xiaotuanbao.login.rememberedUsername'

const FEATURES = [
  {
    key: 'departure',
    title: '发团经营',
    desc: '全流程跟进',
    icon: <ScheduleOutlined />,
  },
  {
    key: 'resource',
    title: '资源安排',
    desc: '车房餐导统筹',
    icon: <ClusterOutlined />,
  },
  {
    key: 'finance',
    title: '财务协同',
    desc: '应收应付核销',
    icon: <AccountBookOutlined />,
  },
] as const

export function LoginPage() {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const navigate = useNavigate()
  const search = useSearch({ from: '/login' })
  const setSession = useAuthStore((state) => state.setSession)
  const [form] = Form.useForm<{ username: string; password: string }>()
  const [rememberUsername, setRememberUsername] = useState(false)

  useEffect(() => {
    const remembered = localStorage.getItem(REMEMBER_USERNAME_KEY)
    if (remembered) {
      setRememberUsername(true)
      form.setFieldsValue({ username: remembered })
    }
  }, [form])

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (result) => {
      setSession(result.user, result.menuKeys, result.actionKeys)
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      queryClient.invalidateQueries({ queryKey: ['organization'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
      const destination = resolvePostLoginDestination(
        result.user,
        result.menuKeys,
        result.actionKeys,
        search.redirect,
      )
      navigate({ to: destination as '/' })
    },
  })

  return (
    <div className={styles.page}>
      <section className={styles.brand} aria-label="品牌介绍">
        <Flex vertical className={styles.brandInner}>
          <Flex
            align="center"
            gap={token.marginMD}
            className={styles.brandLockup}
            aria-label={env.appName}
          >
            <img
              className={styles.brandLogo}
              src="/xiaotuanbao-brand-mark-v2.png"
              alt=""
              aria-hidden="true"
            />
            <Typography.Title level={2} className={styles.brandName}>
              {env.appName}
            </Typography.Title>
          </Flex>

          <div className={styles.copyBlock}>
            <Typography.Title level={2} className={styles.headline}>
              让团单、资源与资金高效协同
            </Typography.Title>
            <Typography.Paragraph className={styles.subheadline}>
              地接旅行社发团经营与财务协作平台
            </Typography.Paragraph>
          </div>

          <Row
            className={styles.features}
            gutter={[token.marginLG, token.marginMD]}
            wrap={false}
          >
            {FEATURES.map((feature) => (
              <Col key={feature.key} flex="1 1 0" className={styles.featureCol}>
                <Flex vertical gap={token.marginXS}>
                  <span className={styles.featureIcon}>{feature.icon}</span>
                  <Typography.Text strong className={styles.featureTitle}>
                    {feature.title}
                  </Typography.Text>
                  <Typography.Text type="secondary" className={styles.featureDesc}>
                    {feature.desc}
                  </Typography.Text>
                </Flex>
              </Col>
            ))}
          </Row>
        </Flex>
      </section>

      <main className={styles.panel} aria-label="登录">
        <Card className={styles.card} variant="outlined">
          <Typography.Title level={3} className={styles.cardTitle}>
            登录工作台
          </Typography.Title>
          <Typography.Paragraph className={styles.cardSubtitle}>
            使用{env.appName}组织用户名登录
          </Typography.Paragraph>

          {loginMutation.error ? (
            <Alert
              type="error"
              title={
                loginMutation.error instanceof Error
                  ? loginMutation.error.message
                  : '无法登录。核对用户名与密码后重试，或联系企业管理员重置密码'
              }
              showIcon
              style={{ marginBottom: token.marginMD }}
            />
          ) : null}

          <Form
            className={styles.form}
            form={form}
            layout="vertical"
            requiredMark={false}
            onFinish={(values) => {
              if (rememberUsername) {
                localStorage.setItem(REMEMBER_USERNAME_KEY, values.username)
              } else {
                localStorage.removeItem(REMEMBER_USERNAME_KEY)
              }
              loginMutation.mutate(values)
            }}
            autoComplete="off"
          >
            <Form.Item
              label="用户名"
              name="username"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input
                size="large"
                prefix={<UserOutlined className={styles.inputIcon} />}
                autoComplete="username"
              />
            </Form.Item>

            <Form.Item
              label="密码"
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                size="large"
                prefix={<LockOutlined className={styles.inputIcon} />}
                autoComplete="current-password"
              />
            </Form.Item>

            <Flex
              className={styles.formExtras}
              align="center"
              justify="space-between"
            >
              <Checkbox
                checked={rememberUsername}
                onChange={(event) => setRememberUsername(event.target.checked)}
              >
                记住用户名
              </Checkbox>
              <Button
                type="link"
                className={styles.forgotLink}
                onClick={() => message.info('请联系企业管理员重置密码')}
              >
                忘记密码？
              </Button>
            </Flex>

            <Button
              className={styles.submit}
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={loginMutation.isPending}
            >
              登录
            </Button>
          </Form>

          <Flex className={styles.secureHint} align="center" gap={token.marginXS}>
            <SafetyCertificateOutlined className={styles.secureIcon} />
            <span>数据安全传输，经营信息可靠存储</span>
          </Flex>
        </Card>

        <Typography.Text type="secondary" className={styles.version}>
          版本 1.0
        </Typography.Text>
      </main>
    </div>
  )
}
