import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Checkbox,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
  Spin,
  Modal,
} from 'antd'
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
  ProductScheduleStatus,
  ProductStatus,
  type ProductScheduleSummary,
} from '@xiaotuanbao/shared'
import { useAuthStore } from '@/app/store/auth.store'
import {
  createProductSchedule,
  deleteProduct,
  getProduct,
  updateProduct,
  updateProductSchedule,
  updateProductSpec,
  type UpdateProductPayload,
} from '@/services/product.service'
import { canEditProduct } from '../utils/product-permission'
import {
  PRODUCT_SCHEDULE_STATUS_LABELS,
  PRODUCT_STATUS_LABELS,
  centsToYuan,
  yuanToCents,
} from '../utils/product-labels'

type BasicsForm = {
  name: string
  status: ProductStatus
  startCity?: string
  endCity?: string
  dayCount?: number | null
  tagsText?: string
}

type TextBlockForm = { content: string }

type SpecForm = {
  name: string
  adultPriceYuan?: number | null
  childPriceYuan?: number | null
  singleRoomSupplementYuan?: number | null
  notes?: string
}

type ScheduleForm = {
  title?: string
  dateRuleText?: string
  startDate?: string
  endDate?: string
  status: ProductScheduleStatus
  priceOnInquiry: boolean
  adultPriceYuan?: number | null
  childPriceYuan?: number | null
  singleRoomSupplementYuan?: number | null
  notes?: string
}

export function ProductDetailPage() {
  const { productId } = useParams({ strict: false })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const canEdit = canEditProduct(useAuthStore((state) => state.actionKeys))
  const [basicsForm] = Form.useForm<BasicsForm>()
  const [shortForm] = Form.useForm<TextBlockForm>()
  const [featuresForm] = Form.useForm<TextBlockForm>()
  const [noticeForm] = Form.useForm<TextBlockForm>()
  const [detailedForm] = Form.useForm<TextBlockForm>()
  const [specForm] = Form.useForm<SpecForm>()
  const [scheduleForm] = Form.useForm<ScheduleForm>()
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<ProductScheduleSummary | null>(null)

  const goBack = () => void navigate({ to: '/product' })

  const { data: product, isLoading, isError } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => getProduct(productId!),
    enabled: Boolean(productId),
  })

  useEffect(() => {
    if (!product) {
      return
    }
    basicsForm.setFieldsValue({
      name: product.name,
      status: product.status as ProductStatus,
      startCity: product.startCity ?? undefined,
      endCity: product.endCity ?? undefined,
      dayCount: product.dayCount,
      tagsText: product.tags.join(', '),
    })
    shortForm.setFieldsValue({ content: product.shortItinerary })
    featuresForm.setFieldsValue({ content: product.featuresText ?? '' })
    noticeForm.setFieldsValue({ content: product.bookingNotice ?? '' })
    detailedForm.setFieldsValue({ content: product.detailedItinerary ?? '' })
    specForm.setFieldsValue({
      name: product.spec.name,
      adultPriceYuan: centsToYuan(product.spec.adultPriceCents),
      childPriceYuan: centsToYuan(product.spec.childPriceCents),
      singleRoomSupplementYuan: centsToYuan(product.spec.singleRoomSupplementCents),
      notes: product.spec.notes ?? undefined,
    })
  }, [product, basicsForm, shortForm, featuresForm, noticeForm, detailedForm, specForm])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['product', productId] })
    queryClient.invalidateQueries({ queryKey: ['products'] })
  }

  const patchProduct = useMutation({
    mutationFn: (payload: UpdateProductPayload) => updateProduct(productId!, payload),
    onSuccess: () => {
      message.success('已保存')
      invalidate()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存失败')
    },
  })

  const specMutation = useMutation({
    mutationFn: (values: SpecForm) =>
      updateProductSpec(productId!, {
        name: values.name.trim(),
        adultPriceCents: yuanToCents(values.adultPriceYuan),
        childPriceCents: yuanToCents(values.childPriceYuan),
        singleRoomSupplementCents: yuanToCents(values.singleRoomSupplementYuan),
        notes: values.notes?.trim() || null,
      }),
    onSuccess: () => {
      message.success('规格默认价已保存（不回写既有班期）')
      invalidate()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存失败')
    },
  })

  const scheduleMutation = useMutation({
    mutationFn: async (values: ScheduleForm) => {
      const payload = {
        title: values.title?.trim() ?? '',
        dateRuleText: values.dateRuleText?.trim() ?? '',
        startDate: values.startDate || null,
        endDate: values.endDate || null,
        status: values.status,
        priceOnInquiry: values.priceOnInquiry,
        adultPriceCents: yuanToCents(values.adultPriceYuan),
        childPriceCents: yuanToCents(values.childPriceYuan),
        singleRoomSupplementCents: yuanToCents(values.singleRoomSupplementYuan),
        notes: values.notes?.trim() || null,
      }
      if (editingSchedule) {
        return updateProductSchedule(productId!, editingSchedule.id, payload)
      }
      return createProductSchedule(productId!, payload)
    },
    onSuccess: () => {
      message.success(editingSchedule ? '班期已更新' : '班期已创建')
      setScheduleOpen(false)
      setEditingSchedule(null)
      scheduleForm.resetFields()
      invalidate()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存班期失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteProduct(productId!),
    onSuccess: () => {
      message.success('产品已删除')
      queryClient.invalidateQueries({ queryKey: ['products'] })
      goBack()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '删除失败')
    },
  })

  const openCreateSchedule = () => {
    setEditingSchedule(null)
    scheduleForm.setFieldsValue({
      title: '',
      dateRuleText: '',
      status: ProductScheduleStatus.ON_SALE,
      priceOnInquiry: false,
      adultPriceYuan: centsToYuan(product?.spec.adultPriceCents),
      childPriceYuan: centsToYuan(product?.spec.childPriceCents),
      singleRoomSupplementYuan: centsToYuan(product?.spec.singleRoomSupplementCents),
    })
    setScheduleOpen(true)
  }

  const openEditSchedule = (schedule: ProductScheduleSummary) => {
    setEditingSchedule(schedule)
    scheduleForm.setFieldsValue({
      title: schedule.title,
      dateRuleText: schedule.dateRuleText,
      startDate: schedule.startDate ?? undefined,
      endDate: schedule.endDate ?? undefined,
      status: schedule.status as ProductScheduleStatus,
      priceOnInquiry: schedule.priceOnInquiry,
      adultPriceYuan: centsToYuan(schedule.adultPriceCents),
      childPriceYuan: centsToYuan(schedule.childPriceCents),
      singleRoomSupplementYuan: centsToYuan(schedule.singleRoomSupplementCents),
      notes: schedule.notes ?? undefined,
    })
    setScheduleOpen(true)
  }

  if (!productId) {
    return (
      <div>
        <Button type="text" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }} onClick={goBack}>
          返回产品中心
        </Button>
        <Typography.Title level={4}>产品不存在</Typography.Title>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin />
      </div>
    )
  }

  if (isError || !product) {
    return (
      <div>
        <Button type="text" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }} onClick={goBack}>
          返回产品中心
        </Button>
        <Typography.Title level={4}>产品不存在</Typography.Title>
      </div>
    )
  }

  const sectionSave = (
    loading: boolean,
    onSave: () => void,
  ) =>
    canEdit ? (
      <Button loading={loading} onClick={onSave}>
        保存
      </Button>
    ) : null

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="text" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }} onClick={goBack}>
          返回产品中心
        </Button>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {product.name}
        </Typography.Title>
        <Tag>{PRODUCT_STATUS_LABELS[product.status as ProductStatus]}</Tag>
        <Tag>散拼</Tag>
        {canEdit && product.schedules.length === 0 ? (
          <Button
            danger
            loading={deleteMutation.isPending}
            onClick={() => {
              Modal.confirm({
                title: `删除产品「${product.name}」？`,
                content: '该产品尚无班期，删除后不可恢复。已有班期的产品只能下架。',
                okText: '删除',
                okButtonProps: { danger: true },
                onOk: () => deleteMutation.mutateAsync(),
              })
            }}
          >
            删除
          </Button>
        ) : null}
      </Space>

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card
          title="基础信息"
          extra={sectionSave(patchProduct.isPending, () =>
            void basicsForm.validateFields().then((values) =>
              patchProduct.mutate({
                name: values.name.trim(),
                status: values.status,
                startCity: values.startCity?.trim() || null,
                endCity: values.endCity?.trim() || null,
                dayCount: values.dayCount ?? null,
                tags: (values.tagsText ?? '')
                  .split(/[,，]/)
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              }),
            ),
          )}
        >
          <Form form={basicsForm} layout="vertical" disabled={!canEdit}>
            <Form.Item name="name" label="产品名称" rules={[{ required: true, message: '请输入名称' }]}>
              <Input maxLength={120} />
            </Form.Item>
            <Form.Item name="status" label="产品状态" rules={[{ required: true }]}>
              <Select
                options={Object.values(ProductStatus).map((status) => ({
                  value: status,
                  label: PRODUCT_STATUS_LABELS[status],
                }))}
              />
            </Form.Item>
            <Space wrap style={{ width: '100%' }}>
              <Form.Item name="startCity" label="出发城市">
                <Input style={{ width: 160 }} />
              </Form.Item>
              <Form.Item name="endCity" label="结束城市">
                <Input style={{ width: 160 }} />
              </Form.Item>
              <Form.Item name="dayCount" label="天数">
                <InputNumber min={1} precision={0} style={{ width: 120 }} />
              </Form.Item>
            </Space>
            <Form.Item name="tagsText" label="标签（逗号分隔，可空）">
              <Input placeholder="如：经典热卖款, A线" />
            </Form.Item>
          </Form>
        </Card>

        <Card
          title="简版行程"
          extra={sectionSave(patchProduct.isPending, () =>
            void shortForm.validateFields().then((values) =>
              patchProduct.mutate({ shortItinerary: values.content ?? '' }),
            ),
          )}
        >
          <Form form={shortForm} layout="vertical" disabled={!canEdit}>
            <Form.Item name="content" style={{ marginBottom: 0 }}>
              <Input.TextArea rows={5} placeholder="可先整段维护，如 D1…Dn" />
            </Form.Item>
          </Form>
        </Card>

        <Card
          title="产品特色"
          extra={sectionSave(patchProduct.isPending, () =>
            void featuresForm.validateFields().then((values) =>
              patchProduct.mutate({ featuresText: values.content?.trim() || null }),
            ),
          )}
        >
          <Form form={featuresForm} layout="vertical" disabled={!canEdit}>
            <Form.Item name="content" style={{ marginBottom: 0 }}>
              <Input.TextArea rows={3} placeholder="可空" />
            </Form.Item>
          </Form>
        </Card>

        <Card
          title="报价"
          extra={sectionSave(specMutation.isPending, () =>
            void specForm.validateFields().then((values) => specMutation.mutate(values)),
          )}
        >
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            单规格默认价；新建班期时复制为快照，改默认价不回写既有班期。
          </Typography.Paragraph>
          <Form form={specForm} layout="vertical" disabled={!canEdit}>
            <Form.Item name="name" label="规格名称" rules={[{ required: true }]}>
              <Input style={{ maxWidth: 240 }} />
            </Form.Item>
            <Space wrap>
              <Form.Item name="adultPriceYuan" label="成人价（元）">
                <InputNumber min={0} precision={2} style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="childPriceYuan" label="儿童价（元）">
                <InputNumber min={0} precision={2} style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="singleRoomSupplementYuan" label="单房差（元）">
                <InputNumber min={0} precision={2} style={{ width: 140 }} />
              </Form.Item>
            </Space>
            <Form.Item name="notes" label="备注">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Form>

          <Typography.Title level={5} style={{ marginTop: 8 }}>
            班期（有效 {product.activeScheduleCount}）
          </Typography.Title>
          {canEdit ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ marginBottom: 12 }}
              onClick={openCreateSchedule}
            >
              新建班期
            </Button>
          ) : null}
          <Table<ProductScheduleSummary>
            rowKey="id"
            pagination={false}
            dataSource={product.schedules}
            columns={[
              { title: '标题', dataIndex: 'title', render: (value) => value || '-' },
              { title: '日期规则', dataIndex: 'dateRuleText', render: (value) => value || '-' },
              {
                title: '成人价',
                key: 'adult',
                render: (_, row) =>
                  row.priceOnInquiry
                    ? '询价'
                    : row.adultPriceCents != null
                      ? `¥${centsToYuan(row.adultPriceCents)}`
                      : '-',
              },
              {
                title: '状态',
                dataIndex: 'status',
                render: (status: ProductScheduleStatus) => (
                  <Tag>{PRODUCT_SCHEDULE_STATUS_LABELS[status]}</Tag>
                ),
              },
              ...(canEdit
                ? [
                    {
                      title: '操作',
                      key: 'actions',
                      render: (_: unknown, row: ProductScheduleSummary) => (
                        <Button type="link" onClick={() => openEditSchedule(row)}>
                          编辑
                        </Button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </Card>

        <Card
          title="报名须知"
          extra={sectionSave(patchProduct.isPending, () =>
            void noticeForm.validateFields().then((values) =>
              patchProduct.mutate({ bookingNotice: values.content?.trim() || null }),
            ),
          )}
        >
          <Form form={noticeForm} layout="vertical" disabled={!canEdit}>
            <Form.Item name="content" style={{ marginBottom: 0 }}>
              <Input.TextArea rows={3} placeholder="可整段粘贴；组织模板后续迭代" />
            </Form.Item>
          </Form>
        </Card>

        <Card
          title="详细行程"
          extra={sectionSave(patchProduct.isPending, () =>
            void detailedForm.validateFields().then((values) =>
              patchProduct.mutate({ detailedItinerary: values.content?.trim() || null }),
            ),
          )}
        >
          <Form form={detailedForm} layout="vertical" disabled={!canEdit}>
            <Form.Item name="content" style={{ marginBottom: 0 }}>
              <Input.TextArea rows={4} placeholder="可空；可先粘贴文本，Word 上传后续迭代" />
            </Form.Item>
          </Form>
        </Card>
      </Space>

      <Drawer
        title={editingSchedule ? '编辑班期' : '新建班期'}
        width={480}
        open={scheduleOpen}
        onClose={() => {
          setScheduleOpen(false)
          setEditingSchedule(null)
          scheduleForm.resetFields()
        }}
        destroyOnHidden
        extra={
          canEdit ? (
            <Button
              type="primary"
              loading={scheduleMutation.isPending}
              onClick={() =>
                void scheduleForm.validateFields().then((values) => scheduleMutation.mutate(values))
              }
            >
              保存
            </Button>
          ) : null
        }
      >
        <Form
          form={scheduleForm}
          layout="vertical"
          initialValues={{ status: ProductScheduleStatus.ON_SALE, priceOnInquiry: false }}
        >
          <Form.Item name="title" label="班期标题">
            <Input />
          </Form.Item>
          <Form.Item name="dateRuleText" label="日期规则原文">
            <Input placeholder="如：天天发团 / 每周一、五" />
          </Form.Item>
          <Space wrap>
            <Form.Item name="startDate" label="开始日期">
              <Input placeholder="YYYY-MM-DD" style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="endDate" label="结束日期">
              <Input placeholder="YYYY-MM-DD" style={{ width: 140 }} />
            </Form.Item>
          </Space>
          <Form.Item name="status" label="班期状态" rules={[{ required: true }]}>
            <Select
              options={Object.values(ProductScheduleStatus).map((status) => ({
                value: status,
                label: PRODUCT_SCHEDULE_STATUS_LABELS[status],
              }))}
            />
          </Form.Item>
          <Form.Item name="priceOnInquiry" valuePropName="checked">
            <Checkbox>明确询价（可无成人价）</Checkbox>
          </Form.Item>
          <Space wrap>
            <Form.Item name="adultPriceYuan" label="成人价（元）">
              <InputNumber min={0} precision={2} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="childPriceYuan" label="儿童价（元）">
              <InputNumber min={0} precision={2} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="singleRoomSupplementYuan" label="单房差（元）">
              <InputNumber min={0} precision={2} style={{ width: 140 }} />
            </Form.Item>
          </Space>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  )
}
