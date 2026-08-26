import { PlusOutlined } from '@ant-design/icons'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Button, Empty, Input, Spin, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { listAgentConversations } from '@/services/agent-conversation.service'
import { useAgentConversationStore } from './agent-conversation.store'
import { groupConversationHistory } from './conversation-history-groups'
import styles from './ConversationHistoryPanel.module.css'

export function ConversationHistoryList({
  enabled = true,
  fillHeight = false,
  onSelect,
  onCreate,
}: {
  enabled?: boolean
  fillHeight?: boolean
  onSelect?: () => void
  onCreate?: () => void
}) {
  const conversationId = useAgentConversationStore((state) => state.conversationId)
  const openHistoricalConversation = useAgentConversationStore(
    (state) => state.openHistoricalConversation,
  )
  const startNewConversation = useAgentConversationStore((state) => state.startNewConversation)
  const [query, setQuery] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)

  const historyQuery = useInfiniteQuery({
    queryKey: ['agent-conversations', query, includeArchived],
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      listAgentConversations(
        {
          q: query || undefined,
          includeArchived: includeArchived || undefined,
          cursor: pageParam,
        },
        { signal, silentError: true },
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  const items = useMemo(
    () => historyQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [historyQuery.data],
  )
  const groups = useMemo(() => groupConversationHistory(items), [items])

  return (
    <>
      <Input.Search
        className={styles.search}
        allowClear
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索标题或提问"
        aria-label="搜索会话"
      />
      <Button
        className={styles.filter}
        type={includeArchived ? 'default' : 'text'}
        onClick={() => setIncludeArchived((current) => !current)}
        aria-pressed={includeArchived}
      >
        {includeArchived ? '只看开放会话' : '显示已归档'}
      </Button>
      <Button
        className={styles.create}
        type="primary"
        icon={<PlusOutlined aria-hidden />}
        block
        aria-label="新建会话"
        onClick={() => {
          startNewConversation()
          onCreate?.()
        }}
      >
        新建会话
      </Button>
      <div className={`${styles.list} ${fillHeight ? styles.listFill : ''}`} role="listbox" aria-label="历史会话">
        {historyQuery.isPending ? (
          <Spin description="正在加载会话历史">
            <div aria-label="正在加载会话历史" style={{ minHeight: 80 }} />
          </Spin>
        ) : groups.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有会话" />
        ) : (
          groups.map((group) => (
            <div key={group.key} className={styles.group}>
              <Typography.Text type="secondary">{group.label}</Typography.Text>
              <div className={styles.groupItems}>
                {group.items.map((item) => (
                  <Button
                    key={item.id}
                    className={styles.item}
                    type="text"
                    role="option"
                    aria-selected={item.id === conversationId}
                    onClick={() => {
                      openHistoricalConversation({ id: item.id, title: item.title })
                      onSelect?.()
                    }}
                  >
                    {item.title || '未命名会话'}
                  </Button>
                ))}
              </div>
            </div>
          ))
        )}
        {historyQuery.hasNextPage ? (
          <Button
            className={styles.more}
            type="link"
            loading={historyQuery.isFetchingNextPage}
            onClick={() => {
              void historyQuery.fetchNextPage()
            }}
          >
            加载更多
          </Button>
        ) : null}
      </div>
    </>
  )
}
