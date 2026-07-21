import { PlusOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
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
  Typography,
} from 'antd'
import { useAuthStore } from '@/app/store/auth.store'
import { PageHeader } from '@/layouts/PageHeader'
import { getWorkbench } from '@/services/workbench.service'
import type {
  WorkbenchAction,
  WorkbenchCoordinatorDepartureItem,
  WorkbenchModule,
  WorkbenchSnapshot,
  WorkbenchTemplate,
} from '@/types/api'
import { formatBusinessDateTime } from '@/utils/formatBusinessDateTime'
import {
  catalogLabel,
  DEPARTURE_STATUS_COLORS,
  DEPARTURE_STATUS_LABELS,
} from '@/features/departure/catalog'
import styles from './HomePage.module.css'
import { workbenchQueryOptions } from './workbench-query'

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
        <Typography.Paragraph type="secondary" className={styles.moduleDescription}>
          {module.description}
        </Typography.Paragraph>
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
              render: (title, item) => (
                <Button
                  type="link"
                  className={styles.departureLink}
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
              title: '日期',
              key: 'dates',
              width: 210,
              render: (_, item) => `${item.startDate} 至 ${item.endDate}`,
            },
            { title: '负责人', dataIndex: 'ownerName', width: 110 },
          ]}
        />
      </Card>
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
          <Typography.Paragraph type="secondary">
            {module.description}
          </Typography.Paragraph>

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

  const coordinatorModule = snapshot.modules.find(isCoordinatorDeliveryModule)
  if (snapshot.template === 'coordinator' && coordinatorModule) {
    const remainingModules = snapshot.modules.filter(
      (module) => module.key !== coordinatorModule.key,
    )
    return (
      <div className={styles.coordinatorContent}>
        <CoordinatorDepartureModule module={coordinatorModule} />
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
