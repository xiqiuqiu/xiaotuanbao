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
  FileDoneOutlined,
  FolderOutlined,
  LockOutlined,
  MoneyCollectOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { login } from '@/services/auth.service'
import { useAuthStore } from '@/app/store/auth.store'
import { env } from '@/config/env'
import { queryClient } from '@/lib/query/client'
import styles from './LoginPage.module.css'

const REMEMBER_USERNAME_KEY = 'xiaotuanbao.login.rememberedUsername'

const FEATURES = [
  {
    key: 'project',
    title: '项目经营',
    desc: '全过程管控',
    icon: <FolderOutlined />,
  },
  {
    key: 'contract',
    title: '合同履约',
    desc: '全周期跟踪',
    icon: <FileDoneOutlined />,
  },
  {
    key: 'fund',
    title: '资金协同',
    desc: '多维度联动',
    icon: <MoneyCollectOutlined />,
  },
] as const

export function LoginPage() {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const navigate = useNavigate()
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
      setSession(result.accessToken, result.user, result.menuKeys)
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      queryClient.invalidateQueries({ queryKey: ['organization'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
      navigate({ to: '/' })
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
              让项目、合同与资金协同流转
            </Typography.Title>
            <Typography.Paragraph className={styles.subheadline}>
              企业项目经营与财务协作平台
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

          <img
            className={styles.illustration}
            src="/login-travel-operations-transparent-v2.png"
            alt="发团协同流程示意：出发地、行程计划、供应商资源、地接服务、酒店资源与结算对账"
          />
        </Flex>
      </section>

      <main className={styles.panel} aria-label="登录">
        <Card className={styles.card} variant="outlined">
          <Typography.Title level={3} className={styles.cardTitle}>
            登录工作台
          </Typography.Title>
          <Typography.Paragraph className={styles.cardSubtitle}>
            使用企业账号继续
          </Typography.Paragraph>

          {loginMutation.error ? (
            <Alert
              type="error"
              title={
                loginMutation.error instanceof Error
                  ? loginMutation.error.message
                  : '登录失败'
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
                placeholder="请输入用户名"
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
                placeholder="请输入密码"
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
                记住账号
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
            <span>安全连接，企业数据加密传输</span>
          </Flex>
        </Card>

        <Typography.Text type="secondary" className={styles.version}>
          版本 1.0
        </Typography.Text>
      </main>
    </div>
  )
}
