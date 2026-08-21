import type { CSSProperties, ReactNode } from 'react'
import {
  CalendarOutlined,
  FormOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { Typography, theme } from 'antd'
import {
  AI_CREATE_WELCOME_SUGGESTIONS,
  greetingForHour,
} from './ai-create-assist-welcome-data'
import styles from './AiCreateAssistChat.module.css'

const SUGGESTION_ICONS = {
  form: FormOutlined,
  search: SearchOutlined,
  calendar: CalendarOutlined,
} as const

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
