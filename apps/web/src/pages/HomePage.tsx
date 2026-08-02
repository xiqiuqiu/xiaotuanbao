import {
  InfoCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { lazy, Suspense, useMemo, type ReactNode } from 'react'
import { DepartureStatus } from '@xiaotuanbao/shared'
import {
  Alert,
  Button,
  Card,
  Empty,
  Flex,
  Result,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd'
import { useAuthStore } from '@/app/store/auth.store'
import { PageHeader } from '@/layouts/PageHeader'
import { getWorkbench } from '@/services/workbench.service'
import type {
  WorkbenchAction,
  WorkbenchCoordinatorDepartureItem,
  WorkbenchCoordinatorPayablePendingItem,
  WorkbenchCoordinatorReceivablePendingItem,
  WorkbenchModule,
  WorkbenchSnapshot,
  WorkbenchTemplate,
} from '@/types/api'
import { formatBusinessDateTime } from '@/utils/formatBusinessDateTime'
import {
  catalogLabel,
  DEPARTURE_STATUS_COLORS,
  DEPARTURE_STATUS_LABELS,
  RESOURCE_KIND_LABELS,
} from '@/features/departure/catalog'
import styles from './HomePage.module.css'
import { OrganizationRiskModule } from './OrganizationRiskModule'
import { workbenchQueryOptions } from './workbench-query'

const CoordinatorTrendModule = lazy(() =>
  import('./CoordinatorTrendModule').then((module) => ({
    default: module.CoordinatorTrendModule,
  })),
)

const FinanceReceivablesModule = lazy(() =>
  import('./FinanceReceivablesModule').then((module) => ({
    default: module.FinanceReceivablesModule,
  })),
)

const FinanceMetricStrip = lazy(() =>
  import('./FinanceReceivablesModule').then((module) => ({
    default: module.FinanceMetricStrip,
  })),
)

const FinanceFundsModule = lazy(() =>
  import('./FinanceFundsModule').then((module) => ({
    default: module.FinanceFundsModule,
  })),
)

const OrganizationScaleModule = lazy(() =>
  import('./OrganizationScaleModule').then((module) => ({
    default: module.OrganizationScaleModule,
  })),
)

function ChartModuleFallback() {
  return <Skeleton active paragraph={{ rows: 4 }} />
}

function LazyChartModule({ children }: { children: ReactNode }) {
  return <Suspense fallback={<ChartModuleFallback />}>{children}</Suspense>
}

const TEMPLATE_LABELS: Record<WorkbenchTemplate, string> = {
  organization_admin: '企业管理员工作台',
  finance: '财务工作台',
  coordinator: '计调工作台',
}

function WorkbenchActionButton({ action }: { action: WorkbenchAction }) {
  const navigate = useNavigate()

  return (
    <Button
      type={action.emphasis === 'primary' ? 'primary' : 'default'}
      icon={<PlusOutlined />}
      onClick={() => void navigate({ to: action.href })}
    >
      {action.label}
    </Button>
  )
}

function isCoordinatorDeliveryModule(module: WorkbenchModule): boolean {
  return module.key === 'coordinator-departures' && (
    module.metrics.some((metric) => metric.key === 'in-progress') ||
    module.items.some((item) => 'kind' in item && item.kind === 'coordinator-departure')
  )
}

function CoordinatorDepartureModule({ module }: { module: WorkbenchModule }) {
  const navigate = useNavigate()
  const items = module.items.filter(
    (item): item is WorkbenchCoordinatorDepartureItem =>
      'kind' in item && item.kind === 'coordinator-departure',
  )

  return (
    <div className={styles.coordinatorContent}>
      <div className={styles.coordinatorMetricGrid}>
        {module.metrics.map((metric) => (
          <button
            key={metric.key}
            type="button"
            className={styles.metricButton}
            aria-label={metric.label}
            disabled={!metric.href}
            onClick={() => metric.href && void navigate({ to: metric.href })}
          >
            <Statistic
              title={metric.label}
              value={metric.value ?? '-'}
              suffix={metric.suffix}
            />
            {metric.href ? <RightOutlined className={styles.metricArrow} /> : null}
          </button>
        ))}
      </div>

      <Card
        className={styles.recentDeparturesCard}
        title={module.title}
        extra={module.href ? (
          <Button type="link" onClick={() => void navigate({ to: module.href! })}>
            查看全部 {module.total ?? 0} 项 <RightOutlined />
          </Button>
        ) : null}
      >
        <Table<WorkbenchCoordinatorDepartureItem>
          rowKey="id"
          dataSource={items}
          pagination={false}
          size="small"
          scroll={{ x: 900 }}
          locale={{ emptyText: '近期暂无进行中或未来 7 天发团' }}
          columns={[
            {
              title: '发团',
              dataIndex: 'title',
              width: 180,
              ellipsis: { showTitle: false },
              render: (title, item) => (
                <Button
                  type="link"
                  className={styles.departureLink}
                  title={title}
                  onClick={() => void navigate({ to: item.href })}
                >
                  {title}
                </Button>
              ),
            },
            {
              title: '时间提示',
              dataIndex: 'timeHint',
              width: 120,
              render: (value) => <Tag color="blue">{value}</Tag>,
            },
            {
              title: '流程状态',
              dataIndex: 'status',
              width: 100,
              render: (value: DepartureStatus) => (
                <Tag color={DEPARTURE_STATUS_COLORS[value] ?? 'default'}>
                  {catalogLabel(DEPARTURE_STATUS_LABELS, value)}
                </Tag>
              ),
            },
            {
              title: '资料待补充',
              dataIndex: 'dataGaps',
              width: 270,
              render: (dataGaps: WorkbenchCoordinatorDepartureItem['dataGaps']) => dataGaps.length > 0 ? (
                <Space size={[4, 4]} wrap>
                  {dataGaps.slice(0, 2).map((gap) => (
                    <Tag key={gap.code} color="orange">{gap.label}</Tag>
                  ))}
                  {dataGaps.length > 2 ? <Tag>另有 {dataGaps.length - 2} 项</Tag> : null}
                </Space>
              ) : <Typography.Text type="secondary">-</Typography.Text>,
            },
            {
              title: '待提交应收',
              dataIndex: 'pendingReceivableCount',
              width: 140,
              render: (value: number) => value > 0
                ? <Tag color="blue">待提交应收 {value} 个</Tag>
                : <Typography.Text type="secondary">-</Typography.Text>,
            },
            {
              title: '日期',
              key: 'dates',
              width: 210,
              render: (_, item) => `${item.startDate} 至 ${item.endDate}`,
            },
            {
              title: '负责人',
              dataIndex: 'ownerName',
              width: 110,
              ellipsis: { showTitle: true },
            },
          ]}
        />
      </Card>
    </div>
  )
}

function isPayablePendingItem(
  item: WorkbenchModule['items'][number],
): item is WorkbenchCoordinatorPayablePendingItem {
  return 'kind' in item && item.kind === 'coordinator-payable-pending'
}

function isReceivablePendingItem(
  item: WorkbenchModule['items'][number],
): item is WorkbenchCoordinatorReceivablePendingItem {
  return 'kind' in item && item.kind === 'coordinator-receivable-pending'
}

function SettlementQueueCard({
  title,
  tooltip,
  tooltipAriaLabel,
  viewAllHref,
  viewAllCount,
  viewAllAriaLabel,
  items,
  emptyText,
}: {
  title: string
  tooltip: string
  tooltipAriaLabel: string
  viewAllHref?: string
  viewAllCount: number
  viewAllAriaLabel: string
  items: Array<WorkbenchCoordinatorPayablePendingItem | WorkbenchCoordinatorReceivablePendingItem>
  emptyText: string
}) {
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const visibleItems = items.slice(0, 5)

  return (
    <Card
      className={styles.settlementCard}
      title={(
        <Flex align="center" gap={token.marginXXS}>
          <Typography.Title level={5}>{title}</Typography.Title>
          <Tooltip title={tooltip}>
            <Button
              type="text"
              size="small"
              icon={<InfoCircleOutlined />}
              aria-label={tooltipAriaLabel}
              styles={{ root: { width: 24, minWidth: 24, height: 24, padding: 0 } }}
            />
          </Tooltip>
        </Flex>
      )}
      extra={viewAllHref ? (
        <Button
          type="link"
          icon={<RightOutlined />}
          iconPlacement="end"
          styles={{ root: { paddingInline: 0 } }}
          aria-label={viewAllAriaLabel}
          onClick={() => void navigate({ to: viewAllHref })}
        >
          查看全部 {viewAllCount} 项
        </Button>
      ) : null}
    >
      {visibleItems.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
      ) : (
        <Flex vertical gap={0} className={styles.settlementQueue}>
          {visibleItems.map((item) => {
            const description = isPayablePendingItem(item)
              ? `${item.departureName} · ${item.segmentName}`
              : item.departureName
            return (
              <button
                type="button"
                key={item.id}
                className={styles.settlementQueueItem}
                title={item.title}
                onClick={() => void navigate({ to: item.href })}
              >
                <Flex vertical gap={token.marginXXS} className={styles.settlementQueueBody}>
                  <Flex align="center" gap={token.marginXS} className={styles.settlementQueueTitleRow}>
                    {isPayablePendingItem(item) ? (
                      <Tag style={{ marginInlineEnd: 0 }}>
                        {catalogLabel(RESOURCE_KIND_LABELS, item.resourceKind)}
                      </Tag>
                    ) : null}
                    <Typography.Text
                      strong
                      ellipsis={{ tooltip: item.title }}
                      className={styles.settlementQueueTitle}
                    >
                      {item.title}
                    </Typography.Text>
                  </Flex>
                  <Typography.Text
                    type="secondary"
                    ellipsis={{ tooltip: description }}
                    style={{ fontSize: token.fontSizeSM }}
                  >
                    {description}
                  </Typography.Text>
                </Flex>
                <RightOutlined aria-hidden className={styles.settlementQueueChevron} />
              </button>
            )
          })}
        </Flex>
      )}
    </Card>
  )
}

function CoordinatorSettlementModule({
  module,
  payableMetric,
}: {
  module: WorkbenchModule
  payableMetric?: WorkbenchModule['metrics'][number]
}) {
  const pendingMetric = module.metrics.find((metric) => metric.key === 'pending-receivables')
  const payableItems = module.items.filter(isPayablePendingItem)
  const pendingItems = module.items.filter(isReceivablePendingItem)

  return (
    <div className={styles.settlementGrid}>
      <SettlementQueueCard
        title="待提交应付"
        tooltip="按尚未提交应付的行程段资源数统计（约定金额大于零且尚无有效资源应付）。已结清发团不计入。"
        tooltipAriaLabel="待提交应付统计口径"
        viewAllHref={payableMetric?.href}
        viewAllCount={payableMetric?.value ?? 0}
        viewAllAriaLabel={`查看全部待提交应付 ${payableMetric?.value ?? 0} 项`}
        items={payableItems}
        emptyText="当前没有待提交应付的资源"
      />
      <SettlementQueueCard
        title="待提交应收"
        tooltip="按尚未提交应收的客源单数统计，数据来自现存客源单与应收记录。"
        tooltipAriaLabel="待提交应收统计口径"
        viewAllHref={pendingMetric?.href}
        viewAllCount={pendingMetric?.value ?? 0}
        viewAllAriaLabel={`查看全部待提交应收 ${pendingMetric?.value ?? 0} 项`}
        items={pendingItems}
        emptyText="当前没有待提交应收的客源单"
      />
    </div>
  )
}

function GenericModuleGrid({
  modules,
  template,
}: {
  modules: WorkbenchModule[]
  template: WorkbenchTemplate
}) {
  return (
    <div className={styles.moduleGrid} data-template={template}>
      {modules.map((module) => (
        <Card key={module.key} title={module.title} className={styles.moduleCard}>
          {module.metrics.length > 0 ? (
            <div className={styles.metricGrid}>
              {module.metrics.map((metric) => (
                <Statistic
                  key={metric.key}
                  title={metric.label}
                  value={metric.value ?? '-'}
                  suffix={metric.suffix}
                />
              ))}
            </div>
          ) : null}

          {module.items.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当前模块暂无待处理数据，可稍后刷新查看"
            />
          ) : (
            <Space orientation="vertical" size={8} className={styles.itemList}>
              {module.items.map((item) => (
                <div key={item.id}>
                  <Typography.Text strong>{item.title}</Typography.Text>
                  {item.description ? (
                    <Typography.Paragraph type="secondary">
                      {item.description}
                    </Typography.Paragraph>
                  ) : null}
                </div>
              ))}
            </Space>
          )}
        </Card>
      ))}
    </div>
  )
}

function WorkbenchContent({ snapshot }: { snapshot: WorkbenchSnapshot }) {
  if (snapshot.modules.length === 0) {
    return (
      <Card>
        <Empty description="当前角色暂无可用模块，请联系企业管理员配置权限" />
      </Card>
    )
  }

  if (snapshot.template === 'organization_admin') {
    const scaleModule = snapshot.modules.find((module) => module.key === 'organization-scale')
    const riskModule = snapshot.modules.find((module) => module.key === 'organization-risk')
    const remainingModules = snapshot.modules.filter(
      (module) =>
        module.key !== scaleModule?.key
        && module.key !== riskModule?.key,
    )
    const topMetrics = [
      ...(scaleModule?.metrics ?? []),
      ...(riskModule?.metrics ?? []).filter(
        (metric) =>
          metric.key === 'overdue-receivables'
          || metric.key === 'pending-settlement',
      ),
    ]
    return (
      <div className={styles.scaleContent}>
        {topMetrics.length > 0 ? (
          <LazyChartModule>
            <FinanceMetricStrip
              metrics={topMetrics}
              columns={topMetrics.length >= 4 ? 4 : 2}
            />
          </LazyChartModule>
        ) : null}
        {scaleModule || riskModule ? (
          <div className={styles.adminMainGrid}>
            {scaleModule ? (
              <LazyChartModule>
                <OrganizationScaleModule module={scaleModule} showMetrics={false} />
              </LazyChartModule>
            ) : null}
            {riskModule ? <OrganizationRiskModule module={riskModule} /> : null}
          </div>
        ) : null}
        {remainingModules.length > 0 ? (
          <GenericModuleGrid modules={remainingModules} template={snapshot.template} />
        ) : null}
      </div>
    )
  }

  if (snapshot.template === 'finance') {
    const receivablesModule = snapshot.modules.find(
      (module) => module.key === 'finance-receivables',
    )
    const fundsModule = snapshot.modules.find(
      (module) => module.key === 'finance-funds',
    )
    const remainingModules = snapshot.modules.filter(
      (module) =>
        module.key !== receivablesModule?.key
        && module.key !== fundsModule?.key,
    )
    const topMetrics = [
      ...(receivablesModule?.metrics ?? []),
      ...(fundsModule?.metrics ?? []),
    ]
    return (
      <div className={styles.financeReceivablesContent}>
        {topMetrics.length > 0 ? (
          <LazyChartModule>
            <FinanceMetricStrip
              metrics={topMetrics}
              columns={topMetrics.length >= 4 ? 4 : 2}
            />
          </LazyChartModule>
        ) : null}
        {receivablesModule || fundsModule ? (
          <div className={styles.financeMainGrid}>
            {receivablesModule ? (
              <LazyChartModule>
                <FinanceReceivablesModule
                  module={receivablesModule}
                  sections={['follow-up']}
                />
              </LazyChartModule>
            ) : null}
            {fundsModule ? (
              <LazyChartModule>
                <FinanceFundsModule module={fundsModule} />
              </LazyChartModule>
            ) : null}
          </div>
        ) : null}
        {receivablesModule ? (
          <LazyChartModule>
            <FinanceReceivablesModule
              module={receivablesModule}
              sections={['aging']}
            />
          </LazyChartModule>
        ) : null}
        {remainingModules.length > 0 ? (
          <GenericModuleGrid modules={remainingModules} template={snapshot.template} />
        ) : null}
      </div>
    )
  }

  const coordinatorModule = snapshot.modules.find(isCoordinatorDeliveryModule)
  if (snapshot.template === 'coordinator' && coordinatorModule) {
    const settlementModule = snapshot.modules.find(
      (module) => module.key === 'coordinator-settlement',
    )
    const trendModule = snapshot.modules.find((module) => module.key === 'coordinator-trend')
    const payableMetric = coordinatorModule.metrics.find(
      (metric) => metric.key === 'pending-payables',
    )
    const remainingModules = snapshot.modules.filter(
      (module) =>
        module.key !== coordinatorModule.key
        && module.key !== settlementModule?.key
        && module.key !== trendModule?.key,
    )
    return (
      <div className={styles.coordinatorContent}>
        <CoordinatorDepartureModule module={coordinatorModule} />
        {settlementModule ? (
          <CoordinatorSettlementModule
            module={settlementModule}
            payableMetric={payableMetric}
          />
        ) : null}
        {trendModule ? (
          <LazyChartModule>
            <CoordinatorTrendModule module={trendModule} />
          </LazyChartModule>
        ) : null}
        {remainingModules.length > 0 ? (
          <GenericModuleGrid modules={remainingModules} template={snapshot.template} />
        ) : null}
      </div>
    )
  }

  return <GenericModuleGrid modules={snapshot.modules} template={snapshot.template} />
}

export function HomePage() {
  const actionKeys = useAuthStore((state) => state.actionKeys)
  const actionKeySet = useMemo(() => new Set(actionKeys), [actionKeys])
  const query = useQuery({
    queryKey: ['workbench'],
    queryFn: getWorkbench,
    ...workbenchQueryOptions,
  })

  if (!query.data && query.isPending) {
    return (
      <Card aria-label="正在加载工作台">
        <Typography.Text>正在加载工作台</Typography.Text>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    )
  }

  if (!query.data) {
    return (
      <Result
        status="error"
        title="工作台加载失败"
        subTitle={query.error instanceof Error ? query.error.message : '请稍后重试'}
        extra={
          <Button type="primary" onClick={() => void query.refetch()}>
            重试
          </Button>
        }
      />
    )
  }

  const snapshot = query.data
  const visibleActions = snapshot.actions.filter((action) =>
    actionKeySet.has(action.requiredPermission),
  )

  return (
    <div className={styles.page}>
      <PageHeader
        title="工作台"
        action={
          <Space wrap>
            {visibleActions.map((action) => (
              <WorkbenchActionButton key={action.key} action={action} />
            ))}
            <Button
              icon={<ReloadOutlined />}
              loading={query.isFetching}
              onClick={() => void query.refetch()}
            >
              刷新
            </Button>
          </Space>
        }
      />

      <Flex className={styles.meta} align="center" justify="space-between" gap={12} wrap>
        <Space wrap>
          <Typography.Text strong>{snapshot.organization.name}</Typography.Text>
          <Tag color="blue">{TEMPLATE_LABELS[snapshot.template]}</Tag>
        </Space>
        <Typography.Text type="secondary">
          数据更新时间：{formatBusinessDateTime(snapshot.asOf)}
          {query.isFetching ? ' · 正在更新' : ''}
        </Typography.Text>
      </Flex>

      {query.isRefetchError ? (
        <Alert
          className={styles.refreshAlert}
          type="warning"
          showIcon
          title="刷新失败，已保留上次数据"
        />
      ) : null}

      <WorkbenchContent snapshot={snapshot} />
    </div>
  )
}
