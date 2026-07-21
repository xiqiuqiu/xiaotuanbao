import { RightOutlined } from '@ant-design/icons'
import { useNavigate } from '@tanstack/react-router'
import { Button, Card, Empty, Space, Tag, Typography } from 'antd'
import type {
  WorkbenchFinanceAccountGenerationItem,
  WorkbenchFinancePendingSettlementItem,
  WorkbenchModule,
} from '@/types/api'
import { formatCents } from '@/features/finance/catalog'
import styles from './HomePage.module.css'

function isSettlementItem(
  item: WorkbenchModule['items'][number],
): item is WorkbenchFinancePendingSettlementItem {
  return 'kind' in item && item.kind === 'finance-pending-settlement'
}

function isGenerationItem(
  item: WorkbenchModule['items'][number],
): item is WorkbenchFinanceAccountGenerationItem {
  return 'kind' in item && item.kind === 'finance-account-generation'
}

function directionLabel(direction: WorkbenchFinancePendingSettlementItem['direction']): string {
  return direction === 'inflow' ? '收入' : '支出'
}

function generationLabel(
  kind: WorkbenchFinanceAccountGenerationItem['generationKind'],
): string {
  return kind === 'receivable' ? '待应收' : '待应付'
}

export function FinanceFundsModule({ module }: { module: WorkbenchModule }) {
  const navigate = useNavigate()
  const settlementItems = module.items.filter(isSettlementItem)
  const generationItems = module.items.filter(isGenerationItem)

  return (
    <div className={styles.financeFundsQueues}>
      <Card
        className={styles.fundsQueueCard}
        title="待核销流水"
        extra={module.href ? (
          <Button type="link" onClick={() => void navigate({ to: module.href! })}>
            查看全部 {module.total ?? 0} 项 <RightOutlined />
          </Button>
        ) : null}
      >
        {settlementItems.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="当前没有待核销流水"
          />
        ) : (
          <Space orientation="vertical" size={0} className={styles.queueList}>
            {settlementItems.map((item) => (
              <button
                type="button"
                key={item.id}
                className={styles.queueItem}
                aria-label={item.title}
                onClick={() => void navigate({ to: item.href })}
              >
                <span>
                  <Typography.Text strong>
                    <Tag color={item.direction === 'inflow' ? 'blue' : 'orange'}>
                      {directionLabel(item.direction)}
                    </Tag>
                    {item.title}
                  </Typography.Text>
                  <Typography.Text type="secondary" className={styles.queueMeta}>
                    {item.transactionDate}
                    {' · '}
                    {formatCents(item.unallocatedAmountCents)}
                  </Typography.Text>
                </span>
                <span>
                  {item.departureClosed ? <Tag color="default">发团已关闭</Tag> : null}
                  <RightOutlined />
                </span>
              </button>
            ))}
          </Space>
        )}
      </Card>

      <Card
        className={styles.fundsQueueCard}
        title="待生成账款"
        extra={module.secondaryHref ? (
          <Button type="link" onClick={() => void navigate({ to: module.secondaryHref! })}>
            查看全部 {module.secondaryTotal ?? 0} 项 <RightOutlined />
          </Button>
        ) : null}
      >
        {generationItems.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="当前没有待生成应收或应付"
          />
        ) : (
          <Space orientation="vertical" size={0} className={styles.queueList}>
            {generationItems.map((item) => (
              <button
                type="button"
                key={item.id}
                className={styles.queueItem}
                aria-label={item.title}
                onClick={() => void navigate({ to: item.href })}
              >
                <span>
                  <Typography.Text strong>
                    <Tag color={item.generationKind === 'receivable' ? 'blue' : 'orange'}>
                      {generationLabel(item.generationKind)}
                    </Tag>
                    {item.title}
                  </Typography.Text>
                  <Typography.Text type="secondary" className={styles.queueMeta}>
                    {formatCents(item.estimatedAmountCents)}
                    {item.description ? ` · ${item.description}` : ''}
                  </Typography.Text>
                </span>
                <span>
                  {item.departureClosed ? <Tag color="default">发团已关闭</Tag> : null}
                  <RightOutlined />
                </span>
              </button>
            ))}
          </Space>
        )}
      </Card>
    </div>
  )
}
