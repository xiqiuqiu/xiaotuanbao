import { Flex, Spin, Typography, theme } from 'antd'
import styles from './AiCreateAssistChat.module.css'

export function AiCreateAssistLoading() {
  const { token } = theme.useToken()

  return (
    <Flex
      className={styles.loading}
      align="center"
      justify="center"
      vertical
      gap={token.marginSM}
      role="status"
      aria-live="polite"
      aria-label="正在读取发团草稿"
    >
      <Spin />
      <Typography.Text type="secondary">正在读取发团草稿…</Typography.Text>
    </Flex>
  )
}
