import { Card, Col, Row, Statistic, Tag, Typography, Alert, Spin } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { fetchHealth } from '@/services/health.service'
import { useAuthStore } from '@/app/store/auth.store'

export function HomePage() {
  const user = useAuthStore((state) => state.user)

  const { data: healthData, isLoading: healthLoading, isError: healthError } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: false,
  })

  return (
    <div>
      <Typography.Title level={3}>工作台</Typography.Title>
      <Typography.Paragraph type="secondary">
        概览整体情况，追踪业务进度 · {user?.organizationName}
      </Typography.Paragraph>
      <Typography.Paragraph>欢迎回来，{user?.name}</Typography.Paragraph>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="今日发团" value={0} suffix="个" />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="待确认客源" value={0} suffix="单" />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="待核销" value={0} suffix="笔" />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="本月应收" value={0} prefix="¥" />
          </Card>
        </Col>
      </Row>

      <Card title="前后端连通性" style={{ marginTop: 24 }}>
        {healthLoading ? (
          <Spin description="正在检测 /api/health ..." />
        ) : healthError ? (
          <Alert
            type="warning"
            showIcon
            title="后端尚未就绪"
            description="当前无法连接 /api/health。启动 apps/api 后刷新页面即可验证连通性。"
          />
        ) : (
          <Alert
            type="success"
            showIcon
            title="后端连接正常"
            description={
              <>
                状态：<Tag color="green">{healthData?.status ?? 'ok'}</Tag>
                {healthData?.timestamp ? ` · ${healthData.timestamp}` : null}
              </>
            }
          />
        )}
      </Card>
    </div>
  )
}
