import { Alert, Button, Card, Descriptions, Space } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { getOrganization } from '@/services/organization.service'
import { PageHeader } from '@/layouts/PageHeader'
import { BookingNoticeTemplatesCard } from './BookingNoticeTemplatesCard'

export function OrganizationPage() {
  const {
    data: organization,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['organization'],
    queryFn: getOrganization,
  })

  const examples = organization?.numberingExamples

  return (
    <div>
      <PageHeader title="组织管理" />

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {isError ? (
          <Alert
            type="error"
            showIcon
            title="组织信息加载失败"
            description={error instanceof Error ? error.message : '请稍后重试'}
            action={
              <Button size="small" onClick={() => void refetch()}>
                重新加载
              </Button>
            }
          />
        ) : null}

        {isLoading || organization ? (
          <>
            <Card title="组织信息" loading={isLoading}>
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label="组织 ID">{organization?.id ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="组织名称">{organization?.name ?? '-'}</Descriptions.Item>
              </Descriptions>
            </Card>

            <Card title="编号设置" loading={isLoading}>
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label="组织业务前缀">
                  {organization?.businessPrefix ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label="设置状态">已设置，不可修改</Descriptions.Item>
                <Descriptions.Item label="发团编号示例">{examples?.departure ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="应收编号示例">{examples?.receivable ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="应付编号示例">{examples?.payable ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="流水编号示例">{examples?.transaction ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="核销编号示例">{examples?.verification ?? '-'}</Descriptions.Item>
              </Descriptions>
            </Card>
          </>
        ) : null}

        <BookingNoticeTemplatesCard />
      </Space>
    </div>
  )
}
