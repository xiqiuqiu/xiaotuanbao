import type { CSSProperties, ReactNode } from 'react'
import {
  CalendarOutlined,
  FormOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { Typography, theme } from 'antd'
import styles from './AiCreateAssistChat.module.css'

export const AI_CREATE_WELCOME_SUGGESTIONS = [
  {
    title: '补全团名和路线',
    description: '根据当前草稿整理候选',
    message: '请根据当前草稿帮我补全团名和路线',
    icon: 'form',
  },
  {
    title: '查找常用路线',
    description: '在组织目录里匹配',
    message: '帮我查一下组织里的常用路线',
    icon: 'search',
  },
  {
    title: '说明团期和人数',
    description: '出团日期、天数或预计人数',
    message: '出团日期、结束日期和预计人数可以怎么填',
    icon: 'calendar',
  },
] as const

const SUGGESTION_ICONS = {
  form: FormOutlined,
  search: SearchOutlined,
  calendar: CalendarOutlined,
} as const

export function greetingForHour(hour: number): string {
  if (hour < 12) {
    return '上午好'
  }
  if (hour < 18) {
    return '下午好'
  }
  return '晚上好'
}

export function AiCreateAssistWelcome({
  input,
  onSelectSuggestion,
}: {
  input?: ReactNode
  onSelectSuggestion: (suggestion: { message: string }) => void
}) {
  const { token } = theme.useToken()

  return (
    <section
      className={styles.welcome}
      aria-label="电子化助理说明"
      style={
        {
          '--welcome-card-border': token.colorBorderSecondary,
          '--welcome-card-hover-border': token.colorPrimaryBorder,
          '--welcome-card-bg': token.colorFillAlter,
          '--welcome-icon': token.colorTextSecondary,
        } as CSSProperties
      }
    >
      <div className={styles.welcomeMain}>
        <div className={styles.welcomeIntro}>
          <Typography.Title level={5} className={styles.welcomeGreeting}>
            {greetingForHour(new Date().getHours())}
          </Typography.Title>
          <Typography.Text type="secondary">今天要做什么？</Typography.Text>
        </div>
        <div className={styles.welcomeCards}>
          {AI_CREATE_WELCOME_SUGGESTIONS.map((suggestion) => {
            const Icon = SUGGESTION_ICONS[suggestion.icon]
            return (
              <button
                key={suggestion.title}
                type="button"
                className={styles.promptCard}
                onClick={() => onSelectSuggestion(suggestion)}
              >
                <span className={styles.promptIcon} aria-hidden>
                  <Icon />
                </span>
                <span className={styles.promptCopy}>
                  <span className={styles.promptTitle}>{suggestion.title}</span>
                  <span className={styles.promptDescription}>{suggestion.description}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <div className={styles.welcomeInput}>{input}</div>
    </section>
  )
}
