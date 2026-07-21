import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
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
  Tag,
  Typography,
} from 'antd'
import { useAuthStore } from '@/app/store/auth.store'
import { PageHeader } from '@/layouts/PageHeader'
import { getWorkbench } from '@/services/workbench.service'
import type { WorkbenchAction, WorkbenchSnapshot, WorkbenchTemplate } from '@/types/api'
import { formatBusinessDateTime } from '@/utils/formatBusinessDateTime'
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

function WorkbenchContent({ snapshot }: { snapshot: WorkbenchSnapshot }) {
  if (snapshot.modules.length === 0) {
    return (
      <Card>
        <Empty description="当前角色暂无可用模块，请联系企业管理员配置权限" />
      </Card>
    )
  }

  return (
    <div className={styles.moduleGrid} data-template={snapshot.template}>
      {snapshot.modules.map((module) => (
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
