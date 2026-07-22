import { useEffect, useState } from 'react'
import { Button, Card, Form, Input, Select, Space, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import type { BookingNoticeTemplateSummary } from '@xiaotuanbao/shared'
import { listBookingNoticeTemplates } from '@/services/product.service'
import { ProductSectionSaveButton } from './ProductSectionSaveButton'

export function ProductBookingNoticeCard({
  content,
  templateId,
  templateName,
  canEdit,
  saving,
  applying,
  onSave,
  onApplyTemplate,
}: {
  content: string
  templateId: string | null
  templateName: string | null
  canEdit: boolean
  saving: boolean
  applying: boolean
  onSave: (content: string) => void
  onApplyTemplate: (templateId: string) => void
}) {
  const [form] = Form.useForm<{ content: string }>()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>()

  const { data: templates = [] } = useQuery({
    queryKey: ['booking-notice-templates'],
    queryFn: ({ signal }) => listBookingNoticeTemplates(signal),
    enabled: canEdit,
  })

  useEffect(() => {
    form.setFieldsValue({ content })
  }, [content, form])

  useEffect(() => {
    setSelectedTemplateId(templateId ?? undefined)
  }, [templateId])

  return (
    <Card
      title="报名须知"
      extra={
        <ProductSectionSaveButton
          canEdit={canEdit}
          loading={saving}
          onSave={() =>
            void form.validateFields().then((values) => onSave(values.content ?? ''))
          }
        />
      }
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        年龄/拼住/退改等规则整段维护；与产品特色分区。引用组织模板后可改写，不会回写模板。
      </Typography.Paragraph>

      {templateName ? (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          最近引用模板：{templateName}
        </Typography.Paragraph>
      ) : null}

      {canEdit ? (
        <Space wrap style={{ marginBottom: 12 }}>
          <Select
            allowClear
            placeholder="选择组织须知模板"
            style={{ minWidth: 240 }}
            value={selectedTemplateId}
            options={templates.map((template: BookingNoticeTemplateSummary) => ({
              value: template.id,
              label: template.name,
            }))}
            onChange={(value) => setSelectedTemplateId(value)}
          />
          <Button
            loading={applying}
            disabled={!selectedTemplateId}
            onClick={() => {
              if (selectedTemplateId) {
                onApplyTemplate(selectedTemplateId)
              }
            }}
          >
            引用模板
          </Button>
        </Space>
      ) : null}

      <Form form={form} layout="vertical" disabled={!canEdit}>
        <Form.Item name="content" style={{ marginBottom: 0 }}>
          <Input.TextArea rows={5} placeholder="可整段粘贴，或从上方引用组织模板后改写" />
        </Form.Item>
      </Form>
    </Card>
  )
}
