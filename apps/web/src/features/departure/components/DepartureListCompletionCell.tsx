import { Typography } from 'antd'
import type { DepartureCompletionTags } from '@xiaotuanbao/shared'
import { listDepartureListCompletionItems } from '../utils/departure-list-completion'
import styles from './DepartureListCompletionCell.module.css'

export function DepartureListCompletionCell({ tags }: { tags: DepartureCompletionTags }) {
  const items = listDepartureListCompletionItems(tags)

  return (
    <div className={styles.root} role="list" aria-label="完成情况">
      {items.map((item) => (
        <Typography.Text
          key={item.category}
          className={styles.line}
          type={item.incomplete ? 'warning' : undefined}
          title={`${item.category}：${item.status}`}
          ellipsis={{ tooltip: { title: `${item.category}：${item.status}` } }}
        >
          {item.status}
        </Typography.Text>
      ))}
    </div>
  )
}
