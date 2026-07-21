import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import {
  PRODUCT_SCHEDULE_STATUS_LABELS,
  PRODUCT_STATUS_LABELS,
  ProductScheduleStatus,
  ProductStatus,
  type ProductScheduleSummary,
} from '@xiaotuanbao/shared'
import { formatCents } from '@/features/finance/catalog'
import { PageHeader } from '@/layouts/PageHeader'
import { StaleDataAlert } from '@/components/StaleDataAlert'
import { useAuthStore } from '@/app/store/auth.store'
import {
  createProductSchedule,
  getProduct,
  offShelfProduct,
  publishProduct,
  restoreProductDraft,
  updateProduct,
  updateProductSchedule,
  updateProductSpec,
  deleteProduct,
} from '@/services/product.service'
import { canEditProduct } from '../utils/product-permission'
import {
  PRODUCT_SCHEDULE_STATUS_OPTIONS,
  centsToYuan,
  yuanToCents,
} from '../utils/product-catalog'

interface BasicFormValues {
  name: string
  tagsText?: string
  departureCity?: string
  arrivalCity?: string
  dayCount?: number | null
  shortItinerary?: string
}

interface SpecFormValues {
  name?: string
  adultYuan?: number | null
  childYuan?: number | null
  singleYuan?: number | null
}

interface ScheduleFormValues {
  description?: string
  dateRuleText?: string
  dateRangeStart?: string
  dateRangeEnd?: string
  adultYuan?: number | null
  childYuan?: number | null
  singleYuan?: number | null
  inquireOnly?: boolean
  notes?: string
  status?: ProductScheduleStatus
}

export function ProductDetailPage() {
  const { productId } = useParams({ strict: false }) as { productId: string }
  const queryClient = useQueryClient()
  const canEdit = canEditProduct(useAuthStore((s) => s.actionKeys))
  const [basicForm] = Form.useForm<BasicFormValues>()
  const [specForm] = Form.useForm<SpecFormValues>()
  const [scheduleForm] = Form.useForm<ScheduleFormValues>()
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<ProductScheduleSummary | null>(null)

  const {
    data: product,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => getProduct(productId),
  })

  useEffect(() => {
    if (!product) return
    basicForm.setFieldsValue({
      name: product.name,
      tagsText: product.tags.join(', '),
      departureCity: product.departureCity ?? undefined,
      arrivalCity: product.arrivalCity ?? undefined,
      dayCount: product.dayCount,
      shortItinerary: product.shortItinerary ?? undefined,
    })
    specForm.setFieldsValue({
      name: product.spec?.name,
      adultYuan: centsToYuan(product.spec?.adultPriceCents),
      childYuan: centsToYuan(product.spec?.childPriceCents),
      singleYuan: centsToYuan(product.spec?.singleSupplementCents),
    })
  }, [product, basicForm, specForm])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['product', productId] })
    void queryClient.invalidateQueries({ queryKey: ['products'] })
  }

  const saveBasic = useMutation({
    mutationFn: (values: BasicFormValues) =>
      updateProduct(productId, {
        name: values.name,
        shortItinerary: values.shortItinerary ?? null,
        departureCity: values.departureCity ?? null,
        arrivalCity: values.arrivalCity ?? null,
        dayCount: values.dayCount ?? null,
        tags: (values.tagsText ?? '')
          .split(/[,，]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      message.success('基础信息已保存')
      invalidate()
    },
    onError: (error: Error) => message.error(error.message || '保存失败'),
  })

  const saveSpec = useMutation({
    mutationFn: (values: SpecFormValues) =>
      updateProductSpec(productId, {
        name: values.name,
        adultPriceCents: yuanToCents(values.adultYuan),
        childPriceCents: yuanToCents(values.childYuan),
        singleSupplementCents: yuanToCents(values.singleYuan),
      }),
    onSuccess: () => {
      message.success('规格默认价已保存（不回写既有班期）')
      invalidate()
    },
    onError: (error: Error) => message.error(error.message || '保存失败'),
  })

  const saveSchedule = useMutation({
    mutationFn: (values: ScheduleFormValues) => {
      const priceFields = editingSchedule
        ? {
            adultPriceCents: yuanToCents(values.adultYuan),
            childPriceCents: yuanToCents(values.childYuan),
            singleSupplementCents: yuanToCents(values.singleYuan),
          }
        : {
            // 新建时省略空价，让服务端从规格默认价快照（ADR-0025）；有填才覆盖。
            ...(values.adultYuan != null
              ? { adultPriceCents: yuanToCents(values.adultYuan) }
              : {}),
            ...(values.childYuan != null
              ? { childPriceCents: yuanToCents(values.childYuan) }
              : {}),
            ...(values.singleYuan != null
              ? { singleSupplementCents: yuanToCents(values.singleYuan) }
              : {}),
          }
      const payload = {
        description: values.description,
        dateRuleText: values.dateRuleText,
        dateRangeStart: values.dateRangeStart || undefined,
        dateRangeEnd: values.dateRangeEnd || undefined,
        ...priceFields,
        inquireOnly: values.inquireOnly === true,
        notes: values.notes,
        status: values.status,
      }
      if (editingSchedule) {
        return updateProductSchedule(productId, editingSchedule.id, payload)
      }
      return createProductSchedule(productId, payload)
    },
    onSuccess: () => {
      message.success(editingSchedule ? '班期已更新' : '班期已创建')
      setScheduleModalOpen(false)
      setEditingSchedule(null)
      scheduleForm.resetFields()
      invalidate()
    },
    onError: (error: Error) => message.error(error.message || '保存失败'),
  })

  const lifecycle = useMutation({
    mutationFn: async (action: 'publish' | 'offShelf' | 'restore' | 'delete') => {
      if (action === 'publish') return publishProduct(productId)
      if (action === 'offShelf') return offShelfProduct(productId)
      if (action === 'restore') return restoreProductDraft(productId)
      await deleteProduct(productId)
      return null
    },
    onSuccess: (_data, action) => {
      if (action === 'delete') {
        message.success('产品已删除')
        window.location.href = '/product'
        return
      }
      message.success('状态已更新')
      invalidate()
    },
    onError: (error: Error) => message.error(error.message || '操作失败'),
  })

  const readOnly = !canEdit || product?.status === ProductStatus.OFF_SHELF

  const openCreateSchedule = () => {
    setEditingSchedule(null)
    scheduleForm.resetFields()
    scheduleForm.setFieldsValue({
      status: ProductScheduleStatus.ON_SALE,
      adultYuan: centsToYuan(product?.spec?.adultPriceCents),
      childYuan: centsToYuan(product?.spec?.childPriceCents),
      singleYuan: centsToYuan(product?.spec?.singleSupplementCents),
    })
    setScheduleModalOpen(true)
  }

  const openEditSchedule = (schedule: ProductScheduleSummary) => {
    setEditingSchedule(schedule)
    scheduleForm.setFieldsValue({
      description: schedule.description,
      dateRuleText: schedule.dateRuleText ?? undefined,
      dateRangeStart: schedule.dateRangeStart ?? undefined,
      dateRangeEnd: schedule.dateRangeEnd ?? undefined,
      adultYuan: centsToYuan(schedule.adultPriceCents),
      childYuan: centsToYuan(schedule.childPriceCents),
      singleYuan: centsToYuan(schedule.singleSupplementCents),
      inquireOnly: schedule.inquireOnly,
      notes: schedule.notes ?? undefined,
      status: schedule.status as ProductScheduleStatus,
    })
    setScheduleModalOpen(true)
  }

  return (
    <>
      <PageHeader
        title={product?.name ?? '产品详情'}
        action={
          canEdit && product ? (
            <Space wrap>
              {product.status === ProductStatus.DRAFT ||
              product.status === ProductStatus.OFF_SHELF ? (
                <Button
                  type="primary"
                  loading={lifecycle.isPending}
                  onClick={() => lifecycle.mutate('publish')}
                >
                  上架
                </Button>
              ) : null}
              {product.status !== ProductStatus.OFF_SHELF ? (
                <Button
                  loading={lifecycle.isPending}
                  onClick={() => lifecycle.mutate('offShelf')}
                >
                  下架
                </Button>
              ) : (
                <Button
                  loading={lifecycle.isPending}
                  onClick={() => lifecycle.mutate('restore')}
                >
                  恢复草稿
                </Button>
              )}
              {product.schedules.length === 0 ? (
                <Button
                  danger
                  loading={lifecycle.isPending}
                  onClick={() => {
                    Modal.confirm({
                      title: '删除产品？',
                      content: '无班期时可物理删除，此操作不可恢复。',
                      onOk: () => lifecycle.mutateAsync('delete'),
                    })
                  }}
                >
                  删除
                </Button>
              ) : null}
            </Space>
          ) : undefined
        }
      />

      {isError ? (
        <StaleDataAlert
          isFetching={false}
          isError={isError}
          hasData={Boolean(product)}
          onRefresh={() => {
            void refetch()
          }}
        />
      ) : null}

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card
          title="基础信息"
          loading={isLoading}
          extra={
            product ? (
              <Tag>
                {PRODUCT_STATUS_LABELS[product.status as ProductStatus] ?? product.status}
              </Tag>
            ) : null
          }
        >
          <Form
            form={basicForm}
            layout="vertical"
            disabled={readOnly}
            onFinish={(values) => saveBasic.mutate(values)}
          >
            <Form.Item
              name="name"
              label="产品名称"
              rules={[{ required: true, message: '请输入名称' }]}
            >
              <Input maxLength={120} />
            </Form.Item>
            <Space wrap size="large" style={{ width: '100%' }}>
              <Form.Item name="departureCity" label="出发城市">
                <Input style={{ width: 160 }} />
              </Form.Item>
              <Form.Item name="arrivalCity" label="结束城市">
                <Input style={{ width: 160 }} />
              </Form.Item>
              <Form.Item name="dayCount" label="天数">
                <InputNumber min={1} style={{ width: 120 }} />
              </Form.Item>
            </Space>
            <Form.Item name="tagsText" label="标签（逗号分隔）">
              <Input placeholder="经典热卖款, A线" />
            </Form.Item>
            {!readOnly ? (
              <Button type="primary" htmlType="submit" loading={saveBasic.isPending}>
                保存基础信息
              </Button>
            ) : null}
          </Form>
        </Card>

        <Card title="简版行程" loading={isLoading}>
          <Form
            form={basicForm}
            layout="vertical"
            disabled={readOnly}
            onFinish={(values) => saveBasic.mutate(values)}
          >
            <Form.Item name="shortItinerary" label="简版行程文案">
              <Input.TextArea rows={6} placeholder="整段粘贴即可；上架前必填" />
            </Form.Item>
            {!readOnly ? (
              <Button type="primary" htmlType="submit" loading={saveBasic.isPending}>
                保存简版行程
              </Button>
            ) : null}
          </Form>
        </Card>

        <Card
          title="报价规格（默认价）"
          loading={isLoading}
          extra={<Typography.Text type="secondary">改默认价不回写既有班期</Typography.Text>}
        >
          <Form
            form={specForm}
            layout="vertical"
            disabled={readOnly}
            onFinish={(values) => saveSpec.mutate(values)}
          >
            <Form.Item name="name" label="规格名称">
              <Input style={{ maxWidth: 240 }} />
            </Form.Item>
            <Space wrap size="large">
              <Form.Item name="adultYuan" label="成人价（元）">
                <InputNumber min={0} precision={2} style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="childYuan" label="儿童价（元）">
                <InputNumber min={0} precision={2} style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="singleYuan" label="单房差（元）">
                <InputNumber min={0} precision={2} style={{ width: 140 }} />
              </Form.Item>
            </Space>
            {!readOnly ? (
              <Button type="primary" htmlType="submit" loading={saveSpec.isPending}>
                保存规格默认价
              </Button>
            ) : null}
          </Form>
        </Card>

        <Card
          title="班期与价格快照"
          loading={isLoading}
          extra={
            !readOnly ? (
              <Button type="primary" onClick={openCreateSchedule}>
                新建班期
              </Button>
            ) : null
          }
        >
          <Table
            rowKey="id"
            pagination={false}
            dataSource={product?.schedules ?? []}
            columns={[
              { title: '说明', dataIndex: 'description', ellipsis: true },
              {
                title: '日期原文',
                dataIndex: 'dateRuleText',
                render: (value: string | null) => value || '-',
              },
              {
                title: '成人价',
                dataIndex: 'adultPriceCents',
                render: (value: number | null, row) =>
                  row.inquireOnly ? '询价' : value != null ? formatCents(value) : '-',
              },
              {
                title: '儿童价',
                dataIndex: 'childPriceCents',
                render: (value: number | null) =>
                  value != null ? formatCents(value) : '-',
              },
              {
                title: '单房差',
                dataIndex: 'singleSupplementCents',
                render: (value: number | null) =>
                  value != null ? formatCents(value) : '-',
              },
              {
                title: '状态',
                dataIndex: 'status',
                render: (status: string) =>
                  PRODUCT_SCHEDULE_STATUS_LABELS[status as ProductScheduleStatus] ?? status,
              },
              {
                title: '操作',
                width: 88,
                render: (_: unknown, row: ProductScheduleSummary) =>
                  readOnly ? null : (
                    <Button type="link" onClick={() => openEditSchedule(row)}>
                      编辑
                    </Button>
                  ),
              },
            ]}
          />
        </Card>
      </Space>

      <Modal
        title={editingSchedule ? '编辑班期' : '新建班期'}
        open={scheduleModalOpen}
        onCancel={() => {
          setScheduleModalOpen(false)
          setEditingSchedule(null)
          scheduleForm.resetFields()
        }}
        onOk={() => scheduleForm.submit()}
        confirmLoading={saveSchedule.isPending}
        destroyOnHidden
        width={640}
      >
        <Form
          form={scheduleForm}
          layout="vertical"
          onFinish={(values) => saveSchedule.mutate(values)}
        >
          <Form.Item name="description" label="班期说明">
            <Input placeholder="如：7月天天发团" />
          </Form.Item>
          <Form.Item name="dateRuleText" label="日期原文">
            <Input placeholder="保留客户原文，如：每周一、五接站" />
          </Form.Item>
          <Space wrap size="large">
            <Form.Item name="dateRangeStart" label="开始日期">
              <Input type="date" />
            </Form.Item>
            <Form.Item name="dateRangeEnd" label="结束日期">
              <Input type="date" />
            </Form.Item>
          </Space>
          <Space wrap size="large">
            <Form.Item name="adultYuan" label="成人价（元）">
              <InputNumber min={0} precision={2} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="childYuan" label="儿童价（元）">
              <InputNumber min={0} precision={2} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="singleYuan" label="单房差（元）">
              <InputNumber min={0} precision={2} style={{ width: 140 }} />
            </Form.Item>
          </Space>
          <Form.Item name="inquireOnly" valuePropName="checked">
            <Checkbox>询价（无明确成人价）</Checkbox>
          </Form.Item>
          <Form.Item name="status" label="班期状态">
            <Select options={PRODUCT_SCHEDULE_STATUS_OPTIONS} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
