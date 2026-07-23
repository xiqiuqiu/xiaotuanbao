import { RightOutlined } from '@ant-design/icons'
import { useNavigate } from '@tanstack/react-router'
import { Button, Card, Empty, Flex, Tag, Typography, theme } from 'antd'
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

function FundsQueueCard({
  title,
  viewAllHref,
  viewAllCount,
  items,
  emptyText,
  renderItem,
}: {
  title: string
  viewAllHref?: string
  viewAllCount: number
  items: Array<WorkbenchFinancePendingSettlementItem | WorkbenchFinanceAccountGenerationItem>
  emptyText: string
  renderItem: (
    item: WorkbenchFinancePendingSettlementItem | WorkbenchFinanceAccountGenerationItem,
  ) => {
    tag: { color: string; label: string }
    meta: string
  }
}) {
  const navigate = useNavigate()
  const { token } = theme.useToken()

  return (
    <Card
      className={styles.fundsQueueCard}
      title={title}
      extra={viewAllHref ? (
        <Button
          type="link"
          icon={<RightOutlined />}
          iconPlacement="end"
          styles={{ root: { paddingInline: 0 } }}
          onClick={() => void navigate({ to: viewAllHref })}
        >
          查看全部 {viewAllCount} 项
        </Button>
      ) : null}
    >
      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
      ) : (
        <Flex vertical gap={0} className={styles.queueList}>
          {items.map((item) => {
            const { tag, meta } = renderItem(item)
            return (
              <button
                type="button"
                key={item.id}
                className={styles.queueItem}
                aria-label={item.title}
                title={item.title}
                onClick={() => void navigate({ to: item.href })}
              >
                <Flex vertical gap={token.marginXXS} className={styles.queueBody}>
                  <Flex align="center" gap={token.marginXS} className={styles.queueTitleRow}>
                    <Tag color={tag.color} style={{ marginInlineEnd: 0 }}>
                      {tag.label}
                    </Tag>
                    <Typography.Text
                      strong
                      ellipsis={{ tooltip: item.title }}
                      className={styles.queueTitle}
                    >
                      {item.title}
                    </Typography.Text>
                  </Flex>
                  <Typography.Text
                    type="secondary"
                    ellipsis={{ tooltip: meta }}
                    className={styles.queueMeta}
                  >
                    {meta}
                  </Typography.Text>
                </Flex>
                <Flex align="center" gap={token.marginXXS} className={styles.queueTrailing}>
                  {item.departureClosed ? <Tag color="default">发团已关闭</Tag> : null}
                  <RightOutlined aria-hidden className={styles.queueChevron} />
                </Flex>
              </button>
            )
          })}
        </Flex>
      )}
    </Card>
  )
}

export function FinanceFundsModule({ module }: { module: WorkbenchModule }) {
  const settlementItems = module.items.filter(isSettlementItem)
  const generationItems = module.items.filter(isGenerationItem)

  return (
    <div className={styles.financeFundsQueues}>
      <FundsQueueCard
        title="待核销流水"
        viewAllHref={module.href}
        viewAllCount={module.total ?? 0}
        items={settlementItems}
        emptyText="当前没有待核销流水"
        renderItem={(item) => {
          const settlement = item as WorkbenchFinancePendingSettlementItem
          return {
            tag: {
              color: settlement.direction === 'inflow' ? 'blue' : 'orange',
              label: directionLabel(settlement.direction),
            },
            meta: `${settlement.transactionDate} · ${formatCents(settlement.unallocatedAmountCents)}`,
          }
        }}
      />

      <FundsQueueCard
        title="待生成账款"
        viewAllHref={module.secondaryHref}
        viewAllCount={module.secondaryTotal ?? 0}
        items={generationItems}
        emptyText="当前没有待生成应收或应付"
        renderItem={(item) => {
          const generation = item as WorkbenchFinanceAccountGenerationItem
          const amount = formatCents(generation.estimatedAmountCents)
          return {
            tag: {
              color: generation.generationKind === 'receivable' ? 'blue' : 'orange',
              label: generationLabel(generation.generationKind),
            },
            meta: generation.description ? `${amount} · ${generation.description}` : amount,
          }
        }}
      />
    </div>
  )
}
