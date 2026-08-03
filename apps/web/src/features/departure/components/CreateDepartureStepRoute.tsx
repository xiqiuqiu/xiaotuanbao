import { useMemo, useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Spin,
  Typography,
  message,
  theme,
} from 'antd'
import { ClockCircleOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { deleteRouteTemplate, listRouteTemplates } from '@/services/route-template.service'
import type { RouteStepValues } from '../utils/departure-wizard-form'
import styles from './CreateDepartureStepRoute.module.css'

interface CreateDepartureStepRouteProps {
  values: RouteStepValues
  onChange: (values: RouteStepValues) => void
}

export function CreateDepartureStepRoute({ values, onChange }: CreateDepartureStepRouteProps) {
  const { token } = theme.useToken()
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

  const selectedTemplate = useMemo(() => {
    if (!values.templateId || !values.routeName) {
      return null
    }

    return templates.find((template) => template.id === values.templateId) ?? {
      id: values.templateId,
      name: values.routeName,
      defaultDayCount: values.defaultDayCount ?? 0,
      usageCount: 0,
      updatedAt: '',
      segmentCount: values.previewSegmentCount,
      resourceCount: values.previewResourceCount,
    }
  }, [templates, values])

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

  const handleTabChange = (key: string) => {
    const mode = key as 'template' | 'manual'
    setActiveTab(mode)

    if (mode === 'manual') {
      onChange({
        mode: 'manual',
        routeName: values.mode === 'manual' ? values.routeName : '',
        defaultDayCount: values.mode === 'manual' ? values.defaultDayCount : undefined,
        startDate: values.mode === 'manual' ? values.startDate : undefined,
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
      <div className={styles.modeBar}>
        <Segmented
          block
          value={activeTab}
          options={[
            { label: '常用路线', value: 'template' },
            { label: '手动输入', value: 'manual' },
          ]}
          onChange={(value) => handleTabChange(String(value))}
        />
      </div>

      {activeTab === 'template' ? (
        <div>
          <Input.Search
            allowClear
            aria-label="搜索路线名称"
            placeholder="搜索路线名称"
            className={styles.search}
            enterButton={
              <Button type="default" icon={<SearchOutlined />} aria-label="搜索路线" />
            }
            onSearch={setKeyword}
          />

          <Typography.Text style={helperTextStyle}>共 {templates.length} 条路线</Typography.Text>

          {isLoading ? (
            <div className={styles.loading}>
              <Spin />
            </div>
          ) : templates.length === 0 ? (
            <Empty
              description="暂无常用路线。可先手动输入路线信息"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button type="link" onClick={() => handleTabChange('manual')}>
                改为手动输入
              </Button>
            </Empty>
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
                        onClick={() => handleSelectTemplate(template)}
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

          {selectedTemplate ? (
            <div className={styles.selectedTemplateBanner}>
              <div>
                <Typography.Text style={helperTextStyle}>已选择路线</Typography.Text>
                <Typography.Text strong>{selectedTemplate.name}</Typography.Text>
              </div>
              <div className={styles.selectedMeta}>
                <Typography.Text style={helperTextStyle}>
                  {selectedTemplate.defaultDayCount} 天
                </Typography.Text>
                <Typography.Text style={helperTextStyle}>
                  已使用 {selectedTemplate.usageCount} 次
                </Typography.Text>
                <Typography.Link onClick={handleClearTemplate}>清除</Typography.Link>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className={styles.manualPanel}>
          <Typography.Title level={5}>手动输入路线</Typography.Title>
          <Typography.Paragraph style={helperTextStyle}>
            未沉淀为常用路线时，可先填写名称、出团日期和默认天数继续创建。
          </Typography.Paragraph>
          <Form layout="vertical" className={styles.manualForm}>
            <Form.Item label="路线名称" required>
              <Input
                aria-label="路线名称"
                placeholder="如：喀纳斯阿勒泰10日线"
                value={values.routeName}
                onChange={(event) =>
                  onChange({ ...values, mode: 'manual', routeName: event.target.value })
                }
              />
            </Form.Item>
            <Form.Item
              label="出团日期"
              required
              extra="必填，将带入下一步并用于默认团名"
            >
              <DatePicker
                className={styles.fullWidth}
                aria-label="出团日期"
                value={values.startDate ? dayjs(values.startDate) : null}
                onChange={(value: Dayjs | null) =>
                  onChange({
                    ...values,
                    mode: 'manual',
                    startDate: value?.format('YYYY-MM-DD'),
                  })
                }
              />
            </Form.Item>
            <Form.Item label="默认天数" extra="可选，用于下一步自动计算结束日期">
              <InputNumber
                min={1}
                max={365}
                placeholder="如：10"
                className={styles.fullWidth}
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
        </div>
      )}
    </div>
  )
}
