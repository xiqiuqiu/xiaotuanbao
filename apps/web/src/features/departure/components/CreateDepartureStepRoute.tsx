import { useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Col, Empty, Input, Modal, Row, Spin, Typography, message, theme } from 'antd'
import { ClockCircleOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons'
import { deleteRouteTemplate, listRouteTemplates } from '@/services/route-template.service'
import type { RouteStepValues } from '../utils/departure-wizard-form'
import styles from './CreateDepartureStepRoute.module.css'

interface CreateDepartureStepRouteProps {
  values: RouteStepValues
  enabled: boolean
  onSelect: (template: {
    id: string
    name: string
    defaultDayCount: number
    segmentCount?: number
    resourceCount?: number
  }) => void
  onClearSelected: () => void
}

export function CreateDepartureStepRoute({
  values,
  enabled,
  onSelect,
  onClearSelected,
}: CreateDepartureStepRouteProps) {
  const { token } = theme.useToken()
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['route-templates', keyword],
    queryFn: () => listRouteTemplates(keyword || undefined),
    enabled,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteRouteTemplate,
    onSuccess: (_result, templateId) => {
      message.success('已删除常用路线')
      if (values.templateId === templateId) {
        onClearSelected()
      }
      void queryClient.invalidateQueries({ queryKey: ['route-templates'] })
    },
    onError: (error: Error) => {
      message.error(error.message || '无法删除常用路线。请稍后重试')
    },
  })

  const handleDeleteTemplate = (template: { id: string; name: string }) => {
    Modal.confirm({
      title: '确认删除该常用路线？',
      content: `删除「${template.name}」后不影响已用该路线建出的发团及其执行安排。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => deleteMutation.mutateAsync(template.id),
    })
  }

  const helperTextStyle = { color: token.colorTextSecondary }

  return (
    <div
      className={styles.routeStep}
      style={
        {
          '--route-fill': token.colorFillAlter,
          '--route-border': token.colorBorderSecondary,
          '--route-radius': `${token.borderRadiusLG}px`,
          '--route-selected-border': token.colorPrimary,
          '--route-selected-bg': token.colorPrimaryBg,
        } as CSSProperties
      }
    >
      <Input.Search
        allowClear
        aria-label="搜索路线名称"
        placeholder="搜索路线名称"
        className={styles.search}
        enterButton={<Button type="default" icon={<SearchOutlined />} aria-label="搜索路线" />}
        onSearch={setKeyword}
      />

      <Typography.Text style={helperTextStyle}>共 {templates.length} 条路线</Typography.Text>

      {isLoading ? (
        <div className={styles.loading}>
          <Spin />
        </div>
      ) : templates.length === 0 ? (
        <Empty description="暂无常用路线。可先填写路线名称" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Row gutter={[16, 16]} className={styles.templateGrid}>
          {templates.map((template) => {
            const selected = values.templateId === template.id

            return (
              <Col key={template.id} xs={24} xl={12}>
                <div
                  className={
                    selected
                      ? `${styles.templateCardShell} ${styles.templateCardShellSelected}`
                      : styles.templateCardShell
                  }
                >
                  <button
                    type="button"
                    className={styles.templateSelect}
                    aria-pressed={selected}
                    aria-label={`选择路线 ${template.name}`}
                    onClick={() => onSelect(template)}
                  >
                    <Typography.Text strong className={styles.templateName}>
                      {template.name}
                    </Typography.Text>
                    <div className={styles.templateMeta}>
                      <Typography.Text style={helperTextStyle}>
                        <ClockCircleOutlined aria-hidden /> {template.defaultDayCount} 天
                      </Typography.Text>
                      <Typography.Text style={helperTextStyle}>
                        已使用 {template.usageCount} 次
                      </Typography.Text>
                    </div>
                  </button>
                  <Button
                    type="text"
                    size="small"
                    danger
                    className={styles.templateDelete}
                    icon={<DeleteOutlined />}
                    aria-label={`删除常用路线 ${template.name}`}
                    onClick={() => handleDeleteTemplate(template)}
                  />
                </div>
              </Col>
            )
          })}
        </Row>
      )}
    </div>
  )
}
