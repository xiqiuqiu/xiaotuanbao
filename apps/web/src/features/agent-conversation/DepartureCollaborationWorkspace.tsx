import { ConversationMaterialsTrigger } from './conversation-materials'
import { SourceOrderReviewField } from '@/features/ai-assist/SourceOrderReviewField'
import { useNavigate } from '@tanstack/react-router'
import { toReturnNavigateOptions, readPersistedReturnLocation } from './agent-conversation-location'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Collapse,
  Descriptions,
  Segmented,
  Skeleton,
  Space,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import {
  SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA,
  SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA,
  DEPARTURE_RESOURCE_REVIEW_PAYLOAD_SCHEMA,
  resolveReviewField,
} from '@xiaotuanbao/ai-contracts'
import type {
  AiReviewCandidateView,
  AiReviewPackageView,
  ReviewConfirmationView,
} from '@/types/api'
import { getSupplier } from '@/services/supplier.service'
import { getPartner } from '@/services/partner.service'
import { listSegments } from '@/services/segment.service'
import { getDeparture } from '@/services/departure.service'
import { getDepartureCollaboration } from '@/services/agent-collaboration.service'
import { useAuthStore } from '@/app/store/auth.store'
import { canEditDeparture } from '@/features/departure/utils/departure-permission'
import { DepartureSourceOrderReview } from '@/features/departure/components/DepartureSourceOrderReview'
import { AgentConversationChat } from './AgentConversationChat'
import { SegmentResourceReviewPanel } from './SegmentResourceReviewPanel'
import { DepartureResourceReviewPanel } from './DepartureResourceReviewPanel'
import { ReviewMaterialConflicts, ReviewRevisionHistory } from './ReviewRevisionHistory'
import { useAgentConversationStore } from './agent-conversation.store'
import { currentPageAttachmentFromLocation } from './page-locator-attachment'
import styles from './DepartureCollaborationWorkspace.module.css'

const categories = ['全部事项', '发团信息', '客源管理', '执行安排', '财务'] as const
const statusLabels: Record<string, string> = {
  pending: '待审核',
  confirmed: '已确认',
  rejected: '已拒绝',
  cancelled: '已取消',
  conflict: '需重新核对',
  superseded: '已有新版本',
}
function categoryOf(pkg: AiReviewPackageView) {
  if (pkg.payloadSchema === SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA) return '客源管理'
  if (
    pkg.payloadSchema === SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA ||
    pkg.payloadSchema === DEPARTURE_RESOURCE_REVIEW_PAYLOAD_SCHEMA
  ) {
    return '执行安排'
  }
  return /receivable|payable|finance/.test(pkg.payloadSchema) ? '财务' : '发团信息'
}

function isResourceReviewSchema(payloadSchema: string) {
  return (
    payloadSchema === SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA ||
    payloadSchema === DEPARTURE_RESOURCE_REVIEW_PAYLOAD_SCHEMA
  )
}

function formalResourceSearch(
  selected: AiReviewPackageView,
  confirmations: ReviewConfirmationView[],
) {
  if (selected.payloadSchema === DEPARTURE_RESOURCE_REVIEW_PAYLOAD_SCHEMA) {
    const objectId = confirmations
      .flatMap((entry) => entry.items)
      .find((item) => item.packageId === selected.id && item.status === 'succeeded')
      ?.resultRef?.objectId
    return {
      tab: 'execution' as const,
      ...(typeof objectId === 'string' ? { highlightDepartureResourceId: objectId } : {}),
    }
  }
  const segment = selected.candidates.find(
    (candidate) => candidate.fieldKey === 'itinerarySegmentId',
  )
  const segmentId =
    segment?.userCorrectedValue !== undefined
      ? segment.userCorrectedValue
      : segment?.proposedValue
  return {
    tab: 'execution' as const,
    ...(typeof segmentId === 'string' ? { segmentId } : {}),
  }
}
function itemTitle(pkg: AiReviewPackageView, ordinal: number) {
  const candidate = pkg.candidates.find(
    (item) => item.fieldKey === 'title' || item.fieldKey === 'name',
  )
  const value =
    candidate?.userCorrectedValue !== undefined
      ? candidate.userCorrectedValue
      : candidate?.proposedValue
  return typeof value === 'string' && value ? value : `${categoryOf(pkg)} · 第 ${ordinal} 项`
}

export function DepartureCollaborationWorkspace({
  departureId,
  expanded,
  collapsed,
  header,
  onExpand,
  onExit,
}: {
  departureId: string
  expanded: boolean
  collapsed: boolean
  header: ReactNode
  onExpand: () => void
  onExit: () => void
}) {
  const [compactPanel, setCompactPanel] = useState<string>('来源会话')
  const navigate = useNavigate()
  const conversationId = useAgentConversationStore((state) => state.conversationId)
  const title = useAgentConversationStore((state) => state.title)
  const openConversation = useAgentConversationStore((state) => state.openHistoricalConversation)
  const startNew = useAgentConversationStore((state) => state.startNewConversation)
  const canEdit = canEditDeparture(useAuthStore((state) => state.actionKeys))
  const [category, setCategory] = useState<string>('全部事项')
  const [selection, setSelection] = useState<{
    scope: string
    id: string
  } | null>(null)
  const scope = `${departureId}:${conversationId ?? 'new'}`
  const [questionTarget, setQuestionTarget] = useState<{ scope: string; id: string | null } | null>(null)
  const questionPackageId = questionTarget?.scope === scope
    ? questionTarget.id
    : sessionStorage.getItem(`collaboration-question:${scope}`)
  const restoreQuestionTarget = useCallback((id: string | null) => {
    if (id) sessionStorage.setItem(`collaboration-question:${scope}`, id)
    else sessionStorage.removeItem(`collaboration-question:${scope}`)
    setQuestionTarget({ scope, id })
  }, [scope])
  const clearQuestionTarget = useCallback((id: string) => {
    if (sessionStorage.getItem(`collaboration-question:${scope}`) !== id) return
    restoreQuestionTarget(null)
  }, [scope, restoreQuestionTarget])
  const askAboutItem = (pkg: AiReviewPackageView) => {
    restoreQuestionTarget(pkg.id)
    setCompactPanel('来源会话')
    requestAnimationFrame(() => document
      .querySelector<HTMLTextAreaElement>('[aria-label="询问小团宝业务"]')?.focus())
  }
  useEffect(() => {
    if (!expanded) return
    const location =
      useAgentConversationStore.getState().returnLocation ?? readPersistedReturnLocation()
    if (!location) return
    void navigate({
      to: '/agent/conversations/$conversationId',
      params: { conversationId: conversationId ?? 'new' },
      replace: true,
      mask: toReturnNavigateOptions(location),
    })
  }, [conversationId, expanded, navigate])

  const select = useCallback(
    (id: string) => {
      setSelection({ scope, id })
      sessionStorage.setItem(`collaboration-selection:${scope}`, id)
    },
    [scope],
  )
  const departure = useQuery({
    queryKey: ['departure', departureId],
    queryFn: () => getDeparture(departureId),
  })
  const history = useQuery({
    queryKey: ['departure-collaboration', departureId, 'history', conversationId],
    queryFn: () => getDepartureCollaboration(departureId),
  })
  useEffect(() => {
    const state = useAgentConversationStore.getState()
    if (
      history.isSuccess &&
      state.view === 'history' &&
      state.conversationId &&
      !history.data.conversations.some((entry) => entry.id === state.conversationId)
    ) {
      state.startNewConversation(currentPageAttachmentFromLocation(`/departure/${departureId}`))
    }
  }, [departureId, history.data, history.isSuccess])
  const collaboration = useQuery({
    queryKey: ['departure-collaboration', departureId, conversationId],
    queryFn: () => getDepartureCollaboration(departureId, conversationId!),
    enabled: Boolean(conversationId),
    refetchInterval: expanded ? 2500 : false,
  })
  const items = conversationId ? (collaboration.data?.items ?? []) : []
  const questionItem = items.find((pkg) => pkg.id === questionPackageId)
  const visible = items.filter((pkg) => category === '全部事项' || categoryOf(pkg) === category)
  const selectedId =
    selection?.scope === scope
      ? selection.id
      : sessionStorage.getItem(`collaboration-selection:${scope}`)
  const selected = visible.find((pkg) => pkg.id === selectedId) ?? visible[0]
  const reviewBodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (reviewBodyRef.current) reviewBodyRef.current.scrollTop = 0
  }, [selected?.id, selected?.status])
  const requestReview = useCallback(
    (id: string, targetDeparture?: string) => {
      if (targetDeparture && targetDeparture !== departureId) {
        sessionStorage.setItem(
          `collaboration-selection:${targetDeparture}:${conversationId ?? 'new'}`,
          id,
        )
        const location = {
          pathname: `/departure/${targetDeparture}`,
          search: '?tab=overview',
          hash: '',
        }
        useAgentConversationStore.getState().expandToGlobal(location)
        void navigate({
          to: '/agent/conversations/$conversationId',
          params: { conversationId: conversationId ?? 'new' },
          mask: toReturnNavigateOptions(location),
        })
        return
      }
      setCategory('全部事项')
      setCompactPanel('事项与审核')
      select(id)
      if (!expanded) onExpand()
    },
    [conversationId, departureId, expanded, navigate, onExpand, select],
  )

  return (
    <aside
      className={styles.surface}
      data-expanded={expanded || undefined}
      data-open={!collapsed || expanded || undefined}
      aria-label={expanded ? '发团协作工作区' : '电子化助理'}
      aria-hidden={collapsed && !expanded}
      inert={(collapsed && !expanded) || undefined}
      data-panel={compactPanel}
    >
      {expanded ? (
        <div className={styles.compactNavigation}>
          <Segmented
            block
            aria-label="工作区视图"
            options={['业务对象', '来源会话', '事项与审核']}
            value={compactPanel}
            onChange={setCompactPanel}
          />
          <Space><ConversationMaterialsTrigger /><Button onClick={onExit}>返回业务页面</Button></Space>
        </div>
      ) : null}
      <aside hidden={!expanded} className={styles.objects} aria-label="业务对象">
        <header className={styles.heading}>
          <strong>业务对象</strong>
        </header>
        <div className={styles.objectBody}>
          {departure.isError ? (
            <Alert
              type="error"
              showIcon
              title="发团信息加载失败"
              action={<Button onClick={() => void departure.refetch()}>重试</Button>}
            />
          ) : departure.isPending ? (
            <Skeleton active paragraph={{ rows: 3 }} />
          ) : (
            <section className={styles.summary}>
              <strong>{departure.data?.name ?? '加载发团信息…'}</strong>
              <span>{departure.data?.departureNo}</span>
              <span>
                人数 {departure.data?.totalGuests ?? '—'} 人 · 负责人{' '}
                {departure.data?.ownerName ?? '—'}
              </span>
              <span>
                {departure.data?.startDate} 至 {departure.data?.endDate}
              </span>
            </section>
          )}
          <nav className={styles.categories} aria-label="业务分类">
            {categories.map((name) => (
              <Button
                key={name}
                type="text"
                aria-pressed={category === name}
                onClick={() => setCategory(name)}
              >
                {name}
              </Button>
            ))}
          </nav>
          <h3>相关协作记录</h3>
          <Button
            block
            onClick={() => startNew(currentPageAttachmentFromLocation(`/departure/${departureId}`))}
          >
            新建协作
          </Button>
          <div className={styles.history}>
            {history.isPending ? <Skeleton active paragraph={{ rows: 3 }} /> : null}
            {history.data?.conversations.map((entry) => (
              <Button
                key={entry.id}
                type="text"
                aria-pressed={entry.id === conversationId}
                title={entry.title}
                onClick={() => {
                  openConversation(entry)
                  useAgentConversationStore
                    .getState()
                    .attachCurrentPage(
                      currentPageAttachmentFromLocation(`/departure/${departureId}`),
                    )
                }}
              >
                <span className={styles.historyTitle}>{entry.title}</span>
              </Button>
            ))}
            {history.isSuccess && !history.data.conversations.length ? (
              <p className={styles.context}>暂无协作记录，点击“新建协作”开始。</p>
            ) : null}
            {history.isError ? (
              <Alert
                type="error"
                showIcon
                title="协作记录加载失败"
                action={<Button onClick={() => void history.refetch()}>重试</Button>}
              />
            ) : null}
          </div>
        </div>
      </aside>
      <section key="conversation" className={styles.conversation} aria-label="来源会话">
        {expanded ? (
          <header className={styles.heading}>
            <strong title={title ?? undefined}>小团助手 · {title}</strong>
            <Space><ConversationMaterialsTrigger /><Button onClick={onExit}>返回业务页面</Button></Space>
          </header>
        ) : (
          header
        )}
        {!expanded ? (
          <div className={styles.entry}>
            <Button block onClick={onExpand}>
              展开协作工作区{items.length ? ` · ${items.length} 项` : ''}
            </Button>
          </div>
        ) : null}
        <div className={styles.chat}>
          <AgentConversationChat
            onReviewRequested={requestReview}
            reviewPackageId={questionPackageId ?? undefined}
            onReviewMessageSent={clearQuestionTarget}
            onReviewMessageRestored={restoreQuestionTarget}
          />
        </div>
        {questionPackageId ? (
          <div className={styles.entry} role="status">
            <Space wrap>
              <Typography.Text>针对：{questionItem
                ? itemTitle(questionItem, items.indexOf(questionItem) + 1)
                : '已引用的审核事项'}</Typography.Text>
              <Button size="small" onClick={() => clearQuestionTarget(questionPackageId)}>取消引用</Button>
            </Space>
          </div>
        ) : null}
      </section>
      <section hidden={!expanded} className={styles.review} aria-label="事项与审核">
        <header className={styles.heading}>
          <strong>事项与审核</strong>
          <span>{visible.length} 项</span>
        </header>
        {collaboration.isError ? (
          <Alert
            type="error"
            showIcon
            title="事项加载失败"
            action={<Button onClick={() => void collaboration.refetch()}>重试</Button>}
          />
        ) : null}
        {conversationId && collaboration.isPending ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : null}
        {!selected && !collaboration.isError && !(conversationId && collaboration.isPending) ? (
          <div className={styles.empty}>
            <h3>{items.length ? `暂无${category}事项` : '从材料开始协作'}</h3>
            <p>
              {items.length
                ? '本次协作的其他业务分类中已有事项。'
                : '在会话中描述需求或上传资料。助手核实后，待审核事项会出现在这里。'}
            </p>
            {items.length ? (
              <Button onClick={() => setCategory('全部事项')}>查看全部事项</Button>
            ) : (
              <Button
                onClick={() => {
                  setCompactPanel('来源会话')
                  requestAnimationFrame(() =>
                    document
                      .querySelector<HTMLTextAreaElement>('[aria-label="询问小团宝业务"]')
                      ?.focus(),
                  )
                }}
              >
                在会话中提供材料
              </Button>
            )}
          </div>
        ) : null}
        {items.length > 0 ? (
          <Tabs
            className={styles.items}
            data-visible-count={visible.length}
            classNames={{
              header: styles.itemTabsHeader,
              body: styles.itemTabsBody,
              content: styles.itemTabContent,
            }}
            style={visible.length ? undefined : { display: 'none' }}
            activeKey={selected?.id ?? ''}
            onChange={select}
            items={items.map((pkg) => ({
              key: pkg.id,
              forceRender: true,
              disabled: !visible.some((item) => item.id === pkg.id),
              label: (
                <Space
                  orientation="vertical"
                  size={4}
                  data-filtered={!visible.some((item) => item.id === pkg.id) || undefined}
                >
                  <span className={styles.itemTitle} title={itemTitle(pkg, items.indexOf(pkg) + 1)}>
                    {itemTitle(pkg, items.indexOf(pkg) + 1)}
                  </span>
                  <Tag
                    color={
                      pkg.status === 'confirmed'
                        ? 'success'
                        : pkg.status === 'pending' || pkg.status === 'conflict'
                          ? 'warning'
                          : 'default'
                    }
                  >
                    {statusLabels[pkg.status] ?? pkg.status}
                  </Tag>
                </Space>
              ),
              children: (
                <div
                  ref={pkg.id === selected?.id ? reviewBodyRef : undefined}
                  className={styles.reviewBody}
                >
                  <div className={styles.reviewItem}>
                    <WorkspaceReviewItem
                      selected={pkg}
                      departureId={departureId}
                      conversationId={conversationId}
                      canEdit={canEdit}
                      focused={expanded && pkg.id === selected?.id}
                      confirmations={collaboration.data?.confirmations ?? []}
                      onAsk={() => askAboutItem(pkg)}
                    />
                  </div>
                </div>
              ),
            }))}
          />
        ) : null}
      </section>
    </aside>
  )
}

function WorkspaceReviewItem({
  selected,
  departureId,
  conversationId,
  canEdit,
  focused,
  confirmations,
  onAsk,
}: {
  selected: AiReviewPackageView
  departureId: string
  conversationId: string | null
  canEdit: boolean
  focused: boolean
  confirmations: ReviewConfirmationView[]
  onAsk: () => void
}) {
  const navigate = useNavigate()
  const failure = confirmations
    .flatMap((entry) => entry.items)
    .find(
      (item) =>
        item.packageId === selected.id && (item.status === 'failed' || item.status === 'conflict'),
    )
  return (
    <>
      <Space className={styles.context}>
        <Typography.Text type="secondary">{categoryOf(selected)}</Typography.Text>
        <Tag
          color={
            selected.status === 'confirmed'
              ? 'success'
              : selected.status === 'pending' || selected.status === 'conflict'
                ? 'warning'
                : 'default'
          }
        >
          {statusLabels[selected.status] ?? selected.status}
        </Tag>
        {selected.status === 'pending' || selected.status === 'conflict' ? (
          <Button size="small" onClick={onAsk}>针对此项提问</Button>
        ) : null}
      </Space>
      {failure ? (
        <Alert type="error" showIcon title={failure.reason ?? '此项未完成，请核对后重试'} />
      ) : null}
      <ReviewRevisionHistory pkg={selected} focused={focused} />
      <ReviewMaterialConflicts pkg={selected} canEdit={canEdit} />
      {!isResourceReviewSchema(selected.payloadSchema) ? (
        <Collapse
          size="small"
          className={styles.evidence}
          items={[
            {
              key: 'evidence',
              label: '查看材料依据',
              children: (
                <Descriptions
                  size="small"
                  column={1}
                  items={selected.candidates
                    .filter((item) => item.evidence.length > 0)
                    .map((item) => ({
                      key: item.fieldKey,
                      label:
                        resolveReviewField(
                          selected.payloadSchema,
                          selected.confirmationUnit,
                          item.fieldKey,
                        )?.label ?? item.fieldKey,
                      children: [
                        ...new Set(
                          item.evidence.map((evidence) =>
                            'excerpt' in evidence ? evidence.excerpt : evidence.rule,
                          ),
                        ),
                      ].join('；'),
                    }))}
                />
              ),
            },
          ]}
        />
      ) : null}
      {selected.payloadSchema === SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA ? (
        <DepartureSourceOrderReview
          key={selected.id}
          departureId={departureId}
          canEdit={canEdit}
          packageId={selected.id}
          onLeaveWorkspace={() =>
            useAgentConversationStore.getState().closeGlobalForBusinessNavigation()
          }
        />
      ) : null}
      {selected.payloadSchema === SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA && conversationId ? (
        <SegmentResourceReviewPanel
          key={selected.id}
          departureId={departureId}
          conversationId={conversationId}
          onlyPackageId={selected.id}
          focusedReviewPackageId={focused ? selected.id : null}
        />
      ) : null}
      {selected.payloadSchema === DEPARTURE_RESOURCE_REVIEW_PAYLOAD_SCHEMA && conversationId ? (
        <DepartureResourceReviewPanel
          key={selected.id}
          departureId={departureId}
          conversationId={conversationId}
          onlyPackageId={selected.id}
          focusedReviewPackageId={focused ? selected.id : null}
        />
      ) : null}
      {selected.status !== 'pending' ? (
        <section className={styles.snapshot} aria-label="审核时的确认内容">
          <Descriptions
            title="审核记录"
            bordered
            size="small"
            column={1}
            items={selected.candidates.map((item) => ({
              key: item.fieldKey,
              label:
                resolveReviewField(selected.payloadSchema, selected.confirmationUnit, item.fieldKey)
                  ?.label ?? item.fieldKey,
              children: (
                <ReviewSnapshotField item={item} pkg={selected} departureId={departureId} />
              ),
            }))}
          />
          <Typography.Paragraph type="secondary">
            以上为本次审核快照，正式业务记录可能已更新。
          </Typography.Paragraph>
        </section>
      ) : null}
      {selected.status === 'confirmed' && isResourceReviewSchema(selected.payloadSchema) ? (
        <Button
          onClick={() => {
            useAgentConversationStore.getState().closeGlobalForBusinessNavigation()
            void navigate({
              to: '/departure/$departureId',
              params: { departureId },
              search: formalResourceSearch(selected, confirmations),
            })
          }}
        >
          查看正式资源
        </Button>
      ) : null}
    </>
  )
}

function ReviewSnapshotField({
  item,
  pkg,
  departureId,
}: {
  item: AiReviewCandidateView
  pkg: AiReviewPackageView
  departureId: string
}) {
  const field = resolveReviewField(pkg.payloadSchema, pkg.confirmationUnit, item.fieldKey)
  const value = item.userCorrectedValue !== undefined ? item.userCorrectedValue : item.proposedValue
  const isReference =
    ['supplierId', 'partnerId', 'itinerarySegmentId'].includes(item.fieldKey) &&
    typeof value === 'string'
  const reference = useQuery({
    queryKey: ['review-reference-label', departureId, item.fieldKey, value],
    enabled: isReference,
    queryFn: async () => {
      if (item.fieldKey === 'supplierId') return (await getSupplier(String(value))).name
      if (item.fieldKey === 'partnerId') return (await getPartner(String(value))).name
      return (
        (await listSegments(departureId)).items.find((segment) => segment.id === value)?.name ??
        '行程段已不可用'
      )
    },
  })
  if (pkg.payloadSchema === SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA && field)
    return (
      <>
        <SourceOrderReviewField
          field={field}
          value={value}
          editing={false}
          onChange={() => {}}
          onDraftPresenceChange={() => {}}
        />
      </>
    )
  return (
    <>
      {isReference
        ? (reference.data ?? (reference.isError ? '关联对象暂不可用' : '加载中…'))
        : field
          ? field.format(value)
          : String(value ?? '未提供')}
    </>
  )
}
