import { useState } from 'react'
import { Button, Card, Form, Input, Modal, Popconfirm, Space, Table, Typography, message } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BookingNoticeTemplateSummary } from '@xiaotuanbao/shared'
import {
  createBookingNoticeTemplate,
  deleteBookingNoticeTemplate,
  listBookingNoticeTemplates,
  updateBookingNoticeTemplate,
} from '@/services/product.service'

type TemplateForm = {
  name: string
  content: string
}

export function BookingNoticeTemplatesCard() {
  // 本页仅挂在 /system/organization；能进入组织管理 ⟺ 可维护模板（企业管理员）。
  const canEdit = true
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<BookingNoticeTemplateSummary | null>(null)
  const [form] = Form.useForm<TemplateForm>()

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['booking-notice-templates'],
    queryFn: ({ signal }) => listBookingNoticeTemplates(signal),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['booking-notice-templates'] })
  }

  const saveMutation = useMutation({
    mutationFn: async (values: TemplateForm) => {
      const payload = {
        name: values.name.trim(),
        content: values.content.trim(),
      }
      if (editing) {
        return updateBookingNoticeTemplate(editing.id, payload)
      }
      return createBookingNoticeTemplate(payload)
    },
    onSuccess: () => {
      message.success(editing ? '模板已更新' : '模板已创建')
      setOpen(false)
      setEditing(null)
      form.resetFields()
      invalidate()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBookingNoticeTemplate(id),
    onSuccess: () => {
      message.success('模板已删除')
      invalidate()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '删除失败')
    },
  })

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setOpen(true)
  }

  const openEdit = (row: BookingNoticeTemplateSummary) => {
    setEditing(row)
    form.setFieldsValue({ name: row.name, content: row.content })
    setOpen(true)
  }

  return (
    <Card
      title="报名须知模板"
      extra={
        canEdit ? (
          <Button type="primary" onClick={openCreate}>
            新建模板
          </Button>
        ) : null
      }
      style={{ marginTop: 16 }}
    >
      <Typography.Paragraph type="secondary">
        企业管理员维护组织级常用须知。产品引用后复制正文，产品侧改写不会回写本模板。
      </Typography.Paragraph>
      <Table<BookingNoticeTemplateSummary>
        rowKey="id"
        loading={isLoading}
        pagination={false}
        dataSource={templates}
        columns={[
          { title: '名称', dataIndex: 'name', width: 200 },
          {
            title: '内容预览',
            dataIndex: 'content',
            ellipsis: true,
            render: (value: string) => value,
          },
          {
            title: '操作',
            width: 160,
            render: (_, row) => (
              <Space>
                <Button type="link" style={{ paddingInline: 0 }} onClick={() => openEdit(row)}>
                  编辑
                </Button>
                <Popconfirm
                  title="删除该模板？"
                  description="已引用产品的正文会保留，仅清除溯源。"
                  onConfirm={() => deleteMutation.mutate(row.id)}
                >
                  <Button type="link" danger style={{ paddingInline: 0 }}>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
        locale={{ emptyText: '暂无模板' }}
      />

      <Modal
        title={editing ? '编辑须知模板' : '新建须知模板'}
        open={open}
        onCancel={() => {
          setOpen(false)
          setEditing(null)
        }}
        onOk={() => void form.validateFields().then((values) => saveMutation.mutate(values))}
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="模板名称"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input placeholder="如：疆游记通用注意事项" />
          </Form.Item>
          <Form.Item
            name="content"
            label="须知正文"
            rules={[{ required: true, message: '请输入须知正文' }]}
          >
            <Input.TextArea rows={8} placeholder="年龄、拼住、退改等规则整段维护" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
