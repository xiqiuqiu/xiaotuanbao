import { useMemo, useState } from 'react'
import {
  CheckCircleFilled,
  CloseOutlined,
  CommentOutlined,
  DownOutlined,
  ExpandOutlined,
  FileTextOutlined,
  HistoryOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoreOutlined,
  PlusOutlined,
  SearchOutlined,
  SendOutlined,
  ShrinkOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  Avatar,
  Button,
  Drawer,
  Input,
  Popover,
  Segmented,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { PrototypeSwitcher } from '@/components/prototype/PrototypeSwitcher'
import {
  MOCK_CONVERSATIONS,
  PROTOTYPE_VARIANTS,
  type MockConversation,
  type PrototypeMode,
  type PrototypeVariant,
} from './mock-data'
import styles from './agent-conversation-prototype.module.css'

const GROUPS: MockConversation['group'][] = ['今天', '昨天', '最近 7 天', '更早']

function CloudMark() {
  return (
    <span className={styles.cloudMark} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

function statusColor(status: MockConversation['status']) {
  if (status === '进行中') return 'processing'
  if (status === '待审核') return 'warning'
  return 'success'
}

type HistoryListProps = {
  activeId: string
  variant: PrototypeVariant
  onSelect: (id: string) => void
  onNew: () => void
  includeActions?: boolean
}

function HistoryList({
  activeId,
  variant,
  onSelect,
  onNew,
  includeActions = true,
}: HistoryListProps) {
  const [query, setQuery] = useState('')
  const conversations = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return keyword
      ? MOCK_CONVERSATIONS.filter((item) =>
          `${item.title} ${item.preview}`.toLowerCase().includes(keyword),
        )
      : MOCK_CONVERSATIONS
  }, [query])

  return (
    <div className={styles.historyContent}>
      {includeActions ? (
        <div className={styles.historyActions}>
          <Button type="text" icon={<PlusOutlined />} onClick={onNew}>
            新建会话
          </Button>
          <Button type="text" icon={<SearchOutlined />} aria-label="聚焦搜索框" />
        </div>
      ) : null}
      <Input
        allowClear
        value={query}
        prefix={<SearchOutlined />}
        placeholder="搜索会话"
        aria-label="搜索历史会话"
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className={styles.historyScroll}>
        {GROUPS.map((group) => {
          const items = conversations.filter((item) => item.group === group)
          if (items.length === 0) return null
          return (
            <section key={group} className={styles.historyGroup}>
              <Typography.Text type="secondary" className={styles.groupLabel}>
                {group}
              </Typography.Text>
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.historyItem} ${
                    item.id === activeId ? styles.historyItemActive : ''
                  }`}
                  onClick={() => onSelect(item.id)}
                >
                  <span className={styles.historyItemMain}>
                    <span className={styles.historyTitle}>{item.title}</span>
                    <span className={styles.historyPreview}>{item.preview}</span>
                  </span>
                  <span className={styles.historyMeta}>
                    {variant !== 'A' ? (
                      <Tag variant="filled" color={statusColor(item.status)}>
                        {item.status}
                      </Tag>
                    ) : null}
                    <span>{item.age}</span>
                  </span>
                </button>
              ))}
            </section>
          )
        })}
      </div>
      {!includeActions ? (
        <Button className={styles.popoverNew} icon={<PlusOutlined />} onClick={onNew}>
          新建会话
        </Button>
      ) : null}
    </div>
  )
}

function TaskCard({ variant }: { variant: PrototypeVariant }) {
  return (
    <section className={styles.taskCard} aria-label="进行中的任务">
      <div className={styles.taskCardHeader}>
        <span className={styles.taskIcon}>
          <SyncOutlined spin={variant === 'C'} />
        </span>
        <div className={styles.taskTitleBlock}>
          <Typography.Text strong>创建 9 月 6 日川西小团</Typography.Text>
          <Typography.Text type="secondary">任务进行中 · 已完成 2/3</Typography.Text>
        </div>
        <Tag color="processing">进行中</Tag>
      </div>
      <div className={styles.taskSteps}>
        <span><CheckCircleFilled /> 基本信息</span>
        <span><CheckCircleFilled /> 发团已创建</span>
        <span className={styles.taskStepPending}>○ 补充客源单</span>
      </div>
      {variant === 'C' ? (
        <div className={styles.taskNext}>
          <span>下一步：确认客源单位与联系人</span>
          <Button size="small">查看任务</Button>
        </div>
      ) : null}
    </section>
  )
}

function ReviewCard() {
  return (
    <section className={styles.reviewCard} aria-label="待确认内容">
      <div className={styles.reviewHeading}>
        <FileTextOutlined />
        <Typography.Text strong>请确认客源单信息</Typography.Text>
        <Tag color="warning">待审核</Tag>
      </div>
      <dl className={styles.reviewFields}>
        <div><dt>客源单位</dt><dd>成都青旅武侯门店</dd></div>
        <div><dt>游客人数</dt><dd>18 人</dd></div>
        <div><dt>应收金额</dt><dd>¥ 32,400.00</dd></div>
      </dl>
      <div className={styles.reviewActions}>
        <Button>修改</Button>
        <Button type="primary">确认并应用</Button>
      </div>
    </section>
  )
}

function ConversationBody({ variant, blank }: { variant: PrototypeVariant; blank: boolean }) {
  if (blank) {
    return (
      <div className={styles.emptyConversation}>
        <CloudMark />
        <Typography.Title level={2}>今天想处理什么？</Typography.Title>
        <Typography.Text type="secondary">
          可以创建发团、补充客源、核对财务，或查询当前业务状态。
        </Typography.Text>
        <div className={styles.suggestions}>
          <button type="button">创建一个新的发团</button>
          <button type="button">查看待处理的应收</button>
          <button type="button">查询供应商结算情况</button>
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles.conversationBody} ${styles[`variant${variant}Body`]}`}>
      {variant === 'C' ? <TaskCard variant={variant} /> : null}
      <div className={styles.messageUser}>
        帮我创建一个 9 月 6 日出发的川西小团，预计 18 人，团名就叫“秋日川西环线”。
      </div>
      <div className={styles.agentRow}>
        <Avatar size={28} className={styles.agentAvatar}>团</Avatar>
        <div className={styles.messageAgent}>
          已根据当前发团页面读取到产品“川西环线 6 日游”。我整理好了基本信息，并创建了待确认内容。
        </div>
      </div>
      {variant !== 'C' ? <TaskCard variant={variant} /> : null}
      <div className={styles.messageUser}>发团没问题，再补一张成都青旅的客源单，18 人。</div>
      <div className={styles.agentRow}>
        <Avatar size={28} className={styles.agentAvatar}>团</Avatar>
        <div className={styles.messageAgent}>
          我读取了刚创建的发团最新状态。客源单位和人数已明确，应收金额根据产品价计算为 ¥32,400，请确认后写入。
        </div>
      </div>
      <ReviewCard />
    </div>
  )
}

function Composer({ blank }: { blank: boolean }) {
  return (
    <div className={styles.composerArea}>
      <div className={styles.contextChip}>
        <FileTextOutlined /> 当前页面：发团详情 · 基本信息
        <button type="button" aria-label="移除当前页面上下文"><CloseOutlined /></button>
      </div>
      <div className={styles.composer}>
        <Input.TextArea
          autoSize={{ minRows: blank ? 3 : 2, maxRows: 5 }}
          placeholder="告诉小团宝你想完成什么…"
          aria-label="发送消息给小团宝"
        />
        <div className={styles.composerFooter}>
          <Button type="text" icon={<PlusOutlined />}>添加来源</Button>
          <Button type="primary" shape="circle" icon={<SendOutlined />} aria-label="发送" />
        </div>
      </div>
    </div>
  )
}

type ChatHeaderProps = {
  title: string
  mode: PrototypeMode
  activeId: string
  variant: PrototypeVariant
  historyOpen: boolean
  onHistoryOpenChange: (open: boolean) => void
  onSelect: (id: string) => void
  onNew: () => void
  onExpand: () => void
  onClose: () => void
}

function ChatHeader(props: ChatHeaderProps) {
  const history = (
    <HistoryList
      activeId={props.activeId}
      variant={props.variant}
      onSelect={(id) => {
        props.onSelect(id)
        props.onHistoryOpenChange(false)
      }}
      onNew={() => {
        props.onNew()
        props.onHistoryOpenChange(false)
      }}
      includeActions={false}
    />
  )

  return (
    <header className={styles.chatHeader}>
      <Popover
        open={props.historyOpen}
        trigger="click"
        placement="bottomLeft"
        content={history}
        overlayClassName={styles.historyPopover}
        onOpenChange={props.onHistoryOpenChange}
      >
        <Button type="text" className={styles.titleButton}>
          <span>{props.title}</span><DownOutlined />
        </Button>
      </Popover>
      <Space size={2}>
        <Tooltip title="新建会话"><Button type="text" icon={<PlusOutlined />} aria-label="新建会话" onClick={props.onNew} /></Tooltip>
        {props.mode === 'side' ? (
          <Tooltip title="进入全局模式"><Button type="text" icon={<ExpandOutlined />} aria-label="进入全局模式" onClick={props.onExpand} /></Tooltip>
        ) : null}
        <Tooltip title="关闭面板"><Button type="text" icon={<CloseOutlined />} aria-label="关闭面板" onClick={props.onClose} /></Tooltip>
      </Space>
    </header>
  )
}

function BusinessBackdrop({ onOpen }: { onOpen: () => void }) {
  return (
    <div className={styles.businessBackdrop}>
      <div className={styles.businessPageHeader}>
        <div><Typography.Title level={3}>秋日川西环线</Typography.Title><Typography.Text type="secondary">2026-09-06 出发 · 18 人</Typography.Text></div>
        <Button type="primary">保存发团</Button>
      </div>
      <div className={styles.businessTabs}><span className={styles.businessTabActive}>基本信息</span><span>客源单</span><span>执行安排</span><span>财务</span></div>
      <div className={styles.businessForm}>
        {['团名', '出发日期', '产品', '计划人数', '负责人', '备注'].map((label, index) => (
          <div key={label}><span>{label}</span><i className={index === 5 ? styles.longSkeleton : ''} /></div>
        ))}
      </div>
      <Button className={styles.reopenButton} icon={<CommentOutlined />} onClick={onOpen}>打开 Agent</Button>
    </div>
  )
}

export function AgentConversationPrototypeHost() {
  const search = useSearch({ strict: false }) as { variant?: string; mode?: string }
  const navigate = useNavigate()
  const variant = (PROTOTYPE_VARIANTS.some((item) => item.key === search.variant)
    ? search.variant
    : 'A') as PrototypeVariant
  const mode: PrototypeMode = search.mode === 'side' ? 'side' : 'global'
  const [activeId, setActiveId] = useState('conv-departure')
  const [paneOpen, setPaneOpen] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false)
  const active = MOCK_CONVERSATIONS.find((item) => item.id === activeId)
  const blank = activeId === 'new'
  const title = blank ? '新会话' : active?.title ?? '会话'

  function setMode(nextMode: PrototypeMode) {
    void navigate({
      search: ((previous: Record<string, unknown>) => ({ ...previous, mode: nextMode })) as never,
      replace: true,
    })
  }

  function createNewConversation() {
    setActiveId('new')
    setPaneOpen(true)
  }

  const chat = (
    <section className={`${styles.chatShell} ${styles[`variant${variant}`]}`}>
      {mode === 'side' ? (
        <ChatHeader
          title={title}
          mode={mode}
          activeId={activeId}
          variant={variant}
          historyOpen={historyOpen}
          onHistoryOpenChange={setHistoryOpen}
          onSelect={setActiveId}
          onNew={createNewConversation}
          onExpand={() => setMode('global')}
          onClose={() => setPaneOpen(false)}
        />
      ) : (
        <header className={styles.globalChatHeader}>
          <Button className={styles.mobileHistoryButton} type="text" icon={<HistoryOutlined />} aria-label="打开历史会话" onClick={() => setMobileHistoryOpen(true)} />
          <div><Typography.Text strong>{title}</Typography.Text><Typography.Text type="secondary">{blank ? '尚未保存' : '1 个任务进行中'}</Typography.Text></div>
          <Space size={2}>
            <Tooltip title="进行中任务"><Button type="text" icon={<SyncOutlined />} aria-label="进行中任务" /></Tooltip>
            <Tooltip title="返回业务页面"><Button type="text" icon={<ShrinkOutlined />} aria-label="返回业务页面" onClick={() => setMode('side')} /></Tooltip>
          </Space>
        </header>
      )}
      <ConversationBody variant={variant} blank={blank} />
      <Composer blank={blank} />
    </section>
  )

  return (
    <main className={styles.prototypePage}>
      <div className={styles.prototypeToolbar}>
        <div>
          <Typography.Text strong>Agent 会话双模式原型</Typography.Text>
          <Typography.Text type="secondary">Mock 数据 · 不连接真实业务</Typography.Text>
        </div>
        <Segmented
          value={mode}
          options={[{ label: '侧边栏', value: 'side' }, { label: '全局模式', value: 'global' }]}
          onChange={(value) => setMode(value as PrototypeMode)}
        />
      </div>

      {mode === 'side' ? (
        <div className={styles.sideStage}>
          <BusinessBackdrop onOpen={() => setPaneOpen(true)} />
          {paneOpen ? <aside className={styles.sidePane}>{chat}</aside> : null}
        </div>
      ) : (
        <div className={`${styles.globalStage} ${styles[`variant${variant}Global`]}`}>
          <aside className={`${styles.historyRail} ${railCollapsed ? styles.historyRailCollapsed : ''}`}>
            <div className={styles.railBrand}>
              <span><CloudMark /><b>小团宝 Agent</b></span>
              <Tooltip title={railCollapsed ? '展开历史导航' : '折叠历史导航'}>
                <Button type="text" icon={railCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} aria-label={railCollapsed ? '展开历史导航' : '折叠历史导航'} onClick={() => setRailCollapsed((value) => !value)} />
              </Tooltip>
            </div>
            {railCollapsed ? (
              <div className={styles.collapsedRailActions}>
                <Tooltip title="新建会话" placement="right"><Button type="text" icon={<PlusOutlined />} onClick={createNewConversation} /></Tooltip>
                <Tooltip title="搜索会话" placement="right"><Button type="text" icon={<SearchOutlined />} onClick={() => setRailCollapsed(false)} /></Tooltip>
              </div>
            ) : (
              <HistoryList activeId={activeId} variant={variant} onSelect={setActiveId} onNew={createNewConversation} />
            )}
          </aside>
          <div className={styles.globalChat}>{chat}</div>
        </div>
      )}

      <Drawer
        title="历史会话"
        placement="left"
        size="min(88vw, 360px)"
        open={mobileHistoryOpen}
        onClose={() => setMobileHistoryOpen(false)}
      >
        <HistoryList activeId={activeId} variant={variant} onSelect={(id) => { setActiveId(id); setMobileHistoryOpen(false) }} onNew={() => { createNewConversation(); setMobileHistoryOpen(false) }} />
      </Drawer>

      <div className={styles.prototypeNote}>
        <MoreOutlined /> A 轻盈留白 · B 高密效率 · C 任务推进
      </div>
      <PrototypeSwitcher variants={[...PROTOTYPE_VARIANTS]} current={variant} />
    </main>
  )
}
