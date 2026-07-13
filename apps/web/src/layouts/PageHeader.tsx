import type { ReactNode } from 'react'
import { Typography } from 'antd'
import styles from './PageHeader.module.css'

type PageHeaderProps = {
  title: ReactNode
  action?: ReactNode
}

export function PageHeader({ title, action }: PageHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.copy}>
        <Typography.Title className={styles.title} level={4}>
          {title}
        </Typography.Title>
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  )
}
