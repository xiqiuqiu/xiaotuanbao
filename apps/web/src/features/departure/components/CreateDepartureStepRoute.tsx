import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Spin,
  Tabs,
  Typography,
  message,
} from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { deleteRouteTemplate, listRouteTemplates } from '@/services/route-template.service'
import type { RouteStepValues } from '../utils/departure-wizard-form'
import styles from './CreateDepartureStepRoute.module.css'

interface CreateDepartureStepRouteProps {
  values: RouteStepValues
  onChange: (values: RouteStepValues) => void
}

export function CreateDepartureStepRoute({ values, onChange }: CreateDepartureStepRouteProps) {
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [activeTab, setActiveTab] = useState<'template' | 'manual'>(
    values.mode === 'copy' ? 'template' : values.mode,
  )

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['route-templates', keyword],
    queryFn: () => listRouteTemplates(keyword || undefined),
    enabled: activeTab === 'template',
  })

  const selectedTemplateLabel = useMemo(() => {
    if (!values.templateId || !values.routeName) {
      return null
    }

    const dayLabel = values.defaultDayCount ? `（${values.defaultDayCount} 天）` : ''
    return `${values.routeName}${dayLabel}`
  }, [values.defaultDayCount, values.routeName, values.templateId])

  const handleClearTemplate = () => {
    onChange({
      mode: 'template',
      routeName: '',
      defaultDayCount: undefined,
      templateId: undefined,
      previewSegmentCount: undefined,
      previewResourceCount: undefined,
    })
  }

  const deleteMutation = useMutation({
    mutationFn: deleteRouteTemplate,
    onSuccess: (_result, templateId) => {
      message.success('已删除常用路线')
      if (values.templateId === templateId) {
        handleClearTemplate()
      }
      void queryClient.invalidateQueries({ queryKey: ['route-templates'] })
    },
    onError: (error: Error) => {
      message.error(error.message || '删除失败')
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

  const handleTabChange = (key: string) => {
    const mode = key as 'template' | 'manual'
    setActiveTab(mode)

    if (mode === 'manual') {
      onChange({
        mode: 'manual',
        routeName: values.mode === 'manual' ? values.routeName : '',
        defaultDayCount: values.mode === 'manual' ? values.defaultDayCount : undefined,
      })
      return
    }

    onChange({
      mode: 'template',
      routeName: '',
      defaultDayCount: undefined,
      templateId: undefined,
      previewSegmentCount: undefined,
      previewResourceCount: undefined,
    })
  }

  const handleSelectTemplate = (template: {
    id: string
    name: string
    defaultDayCount: number
    segmentCount?: number
    resourceCount?: number
  }) => {
    onChange({
      ...values,
      mode: 'template',
      templateId: template.id,
      routeName: template.name,
      defaultDayCount: template.defaultDayCount,
      previewSegmentCount: template.segmentCount,
      previewResourceCount: template.resourceCount,
    })
  }

  return (
    <div>
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          {
            key: 'template',
            label: '常用路线',
            children: (
              <div>
                <Input.Search
                  allowClear
                  placeholder="搜索路线名称"
                  style={{ marginBottom: 16, maxWidth: 360 }}
                  onSearch={setKeyword}
                />

                {isLoading ? (
                  <div style={{ textAlign: 'center', padding: 48 }}>
                    <Spin />
                  </div>
                ) : templates.length === 0 ? (
                  <Empty description="暂无常用路线" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  <Row gutter={[16, 16]}>
                    {templates.map((template) => {
                      const selected = values.templateId === template.id

                      return (
                        <Col key={template.id} xs={24} sm={12} lg={8}>
                          <Card
                            hoverable
                            onClick={() => handleSelectTemplate(template)}
                            style={{
                              borderColor: selected ? '#1677ff' : undefined,
                              boxShadow: selected
                                ? '0 0 0 2px rgba(22, 119, 255, 0.15)'
                                : undefined,
                            }}
                          >
                            <div className={styles.templateCardHeader}>
                              <Typography.Text strong>{template.name}</Typography.Text>
                              <Button
                                type="link"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                aria-label={`删除常用路线 ${template.name}`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleDeleteTemplate(template)
                                }}
                              />
                            </div>
                            <Typography.Paragraph
                              type="secondary"
                              style={{ marginBottom: 0, marginTop: 8 }}
                            >
                              {template.defaultDayCount} 天 · 已使用 {template.usageCount} 次
                            </Typography.Paragraph>
                          </Card>
                        </Col>
                      )
                    })}
                  </Row>
                )}

                {selectedTemplateLabel ? (
                  <div className={styles.selectedTemplateBanner}>
                    <Typography.Text>已选：{selectedTemplateLabel}</Typography.Text>
                    <Typography.Link onClick={handleClearTemplate}>清除</Typography.Link>
                  </div>
                ) : null}
              </div>
            ),
          },
          {
            key: 'manual',
            label: '手动输入',
            children: (
              <Form layout="vertical" style={{ maxWidth: 480 }}>
                <Form.Item label="路线名称" required>
                  <Input
                    placeholder="如：喀纳斯阿勒泰10日线"
                    value={values.routeName}
                    onChange={(event) =>
                      onChange({ ...values, mode: 'manual', routeName: event.target.value })
                    }
                  />
                </Form.Item>
                <Form.Item label="默认天数" extra="可选，用于 Step 2 自动计算结束日期">
                  <InputNumber
                    min={1}
                    max={365}
                    placeholder="如：10"
                    style={{ width: '100%' }}
                    value={values.defaultDayCount}
                    onChange={(value) =>
                      onChange({
                        ...values,
                        mode: 'manual',
                        defaultDayCount: value ?? undefined,
                      })
                    }
                  />
                </Form.Item>
              </Form>
            ),
          },
        ]}
      />
    </div>
  )
}
