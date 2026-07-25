import { useEffect, useMemo, useRef } from 'react'
import {
  Alert,
  Col,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Typography,
  Button,
} from 'antd'
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import {
  FareAdjustmentKind,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
  DirectoryProfileStatus,
} from '@xiaotuanbao/shared'
import type { SourceOrderSummary } from '@/types/api'
import { listPartners } from '@/services/partner.service'
import { getSourceOrder } from '@/services/source-order.service'
import {
  FARE_ADJUSTMENT_DIRECTION_OPTIONS,
  FARE_ADJUSTMENT_KIND_OPTIONS,
  SOURCE_ORDER_COLLECTION_OPTIONS,
  SOURCE_ORDER_DISCOUNT_OPTIONS,
  defaultDirectionForFareAdjustmentKind,
  formatCents,
} from '../catalog'
import {
  computeFormAmounts,
  createEmptySourceOrderFormValues,
  formValuesToPayload,
  formatSourceOrderAmountSummary,
  sourceOrderToFormValues,
  totalGuestCount,
  type SourceOrderFormValues,
  type SourceOrderPathBaseline,
} from '../utils/source-order-form'

interface SourceOrderDrawerProps {
  open: boolean
  editing: SourceOrderSummary | null
  readOnly: boolean
  amountReadOnly?: boolean
  loading: boolean
  /** 未生成应收时可展示「保存并生成应收」。 */
  canSaveAndGenerate?: boolean
  saveAndGenerateLoading?: boolean
  onClose: () => void
  onSubmit: (
    values: ReturnType<typeof formValuesToPayload>,
    pathBaseline: SourceOrderPathBaseline | null,
    options?: { generateReceivable?: boolean },
  ) => void
}

function AmountPreview({ form }: { form: ReturnType<typeof Form.useForm<SourceOrderFormValues>>[0] }) {
  const watched = Form.useWatch([], form)
  const amounts = useMemo(() => {
    if (watched == null) {
      return null
    }
    const adult = watched.adultGuestCount ?? 0
    const child = watched.childGuestCount ?? 0
    if (adult + child < 1) {
      return null
    }
    return computeFormAmounts({
      adultGuestCount: adult,
      childGuestCount: child,
      adultUnitPriceYuan: watched.adultUnitPriceYuan,
      childUnitPriceYuan: watched.childUnitPriceYuan,
      discountType: watched.discountType ?? SourceOrderDiscountType.NONE,
      discountYuan: watched.discountYuan,
      collectionMode: watched.collectionMode ?? SourceOrderCollectionMode.GUEST_ONLY,
      partnerCollectedYuan: watched.partnerCollectedYuan,
      fareAdjustments: watched.fareAdjustments ?? [],
    })
  }, [watched])

  if (!amounts) {
    return null
  }

  const collectionMode =
    (watched?.collectionMode as SourceOrderCollectionMode | undefined) ??
    SourceOrderCollectionMode.GUEST_ONLY

  return (
    <Typography.Text type="secondary">
      {formatSourceOrderAmountSummary(amounts, collectionMode, formatCents)}
    </Typography.Text>
  )
}

function unitPriceRequiredWhenCountPositive(countField: 'adultGuestCount' | 'childGuestCount') {
  return ({ getFieldValue }: { getFieldValue: (name: string) => unknown }) => ({
    validator(_: unknown, value: number | null | undefined) {
      const count = Number(getFieldValue(countField) ?? 0)
      if (count > 0 && (value === undefined || value === null)) {
        return Promise.reject(new Error('请输入团款单价'))
      }
      return Promise.resolve()
    },
  })
}

function totalGuestCountAtLeastOne(getFieldValue: (name: string) => unknown) {
  return async () => {
    const adult = Number(getFieldValue('adultGuestCount') ?? 0)
    const child = Number(getFieldValue('childGuestCount') ?? 0)
    if (adult + child < 1) {
      throw new Error('总人数必须大于0')
    }
  }
}

export function SourceOrderDrawer({
  open,
  editing,
  readOnly,
  amountReadOnly = false,
  loading,
  canSaveAndGenerate = false,
  saveAndGenerateLoading = false,
  onClose,
  onSubmit,
}: SourceOrderDrawerProps) {
  const [form] = Form.useForm<SourceOrderFormValues>()
  const submitIntentRef = useRef<'save' | 'saveAndGenerate'>('save')
  const sourceOrderId = editing?.id ?? null
  const isCreate = open && !sourceOrderId
  const actionsBusy = loading || saveAndGenerateLoading

  const {
    data: detail,
    isLoading: detailLoading,
    isError: detailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['source-order', sourceOrderId],
    queryFn: ({ signal }) => getSourceOrder(sourceOrderId!, signal),
    enabled: open && Boolean(sourceOrderId),
    staleTime: 0,
    refetchOnMount: 'always',
  })

  // View/edit always hydrate from a fresh GET; create uses empty defaults.
  const resolvedOrder = isCreate ? null : (detail ?? null)
  const detailReady = isCreate || Boolean(detail)

  const discountType = Form.useWatch('discountType', form)
  const collectionMode = Form.useWatch('collectionMode', form)
  const adultGuestCount = Form.useWatch('adultGuestCount', form) ?? 0
  const childGuestCount = Form.useWatch('childGuestCount', form) ?? 0
  const adultUnitPriceYuan = Form.useWatch('adultUnitPriceYuan', form)
  const childUnitPriceYuan = Form.useWatch('childUnitPriceYuan', form)
  const amountFieldsLocked = Boolean(resolvedOrder?.amountFieldsLocked)
  const lockAmounts = readOnly || amountReadOnly || amountFieldsLocked

  const derivedTotalGuests = totalGuestCount({
    adultGuestCount,
    childGuestCount,
  })
  const fareAdjustments =
    Form.useWatch('fareAdjustments', form) ?? ([] as SourceOrderFormValues['fareAdjustments'])
  const derivedAmounts = computeFormAmounts({
    adultGuestCount: adultGuestCount ?? 0,
    childGuestCount: childGuestCount ?? 0,
    adultUnitPriceYuan,
    childUnitPriceYuan,
    discountType: discountType ?? SourceOrderDiscountType.NONE,
    discountYuan: undefined,
    collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
    fareAdjustments,
  })
  const derivedGrossYuan = derivedAmounts.grossReceivableCents / 100
  const derivedAdjustmentNetYuan = derivedAmounts.fareAdjustmentNetCents / 100
  const usedFixedKinds = new Set(
    fareAdjustments
      .map((item) => item?.kind)
      .filter((kind): kind is FareAdjustmentKind => Boolean(kind) && kind !== FareAdjustmentKind.CUSTOM),
  )

  const formKey = sourceOrderId ?? 'new'
  const initialValues = useMemo(
    () =>
      resolvedOrder
        ? sourceOrderToFormValues(resolvedOrder)
        : createEmptySourceOrderFormValues(),
    [resolvedOrder],
  )

  const resetSubmitIntent = () => {
    submitIntentRef.current = 'save'
  }

  useEffect(() => {
    if (!open) {
      resetSubmitIntent()
      return
    }
    if (!detailReady) {
      return
    }

    form.resetFields()
    form.setFieldsValue(initialValues)
  }, [detailReady, form, initialValues, open])

  const handleClose = () => {
    resetSubmitIntent()
    form.resetFields()
    onClose()
  }

  const { data: partnersResult } = useQuery({
    queryKey: ['partners', 'source-order-select'],
    queryFn: () =>
      listPartners({
        status: DirectoryProfileStatus.ACTIVE,
        pageSize: 100,
      }),
    enabled: open,
  })

  const drawerLoading = Boolean(sourceOrderId) && detailLoading && !detail

  return (
    <Drawer
      title={readOnly ? '查看客源单' : sourceOrderId ? '编辑客源单' : '添加客源单'}
      open={open}
      size={560}
      onClose={handleClose}
      destroyOnHidden
      loading={drawerLoading}
      styles={{ footer: { paddingBlock: 16 } }}
      footer={
        detailError && sourceOrderId ? null : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {detailReady ? <AmountPreview form={form} /> : null}
            </div>
            {readOnly ? (
              <Button onClick={handleClose}>关闭</Button>
            ) : (
              <Space>
                <Button onClick={handleClose} disabled={actionsBusy}>
                  取消
                </Button>
                {canSaveAndGenerate ? (
                  <Button
                    loading={saveAndGenerateLoading}
                    disabled={!detailReady || actionsBusy}
                    onClick={() => {
                      submitIntentRef.current = 'saveAndGenerate'
                      form.submit()
                    }}
                  >
                    保存并生成应收
                  </Button>
                ) : null}
                <Button
                  type="primary"
                  loading={loading}
                  disabled={!detailReady || saveAndGenerateLoading}
                  onClick={() => {
                    submitIntentRef.current = 'save'
                    form.submit()
                  }}
                >
                  保存
                </Button>
              </Space>
            )}
          </div>
        )
      }
    >
      {detailError && sourceOrderId ? (
        <Alert
          type="error"
          showIcon
          title="客源单加载失败"
          description="请检查网络后重试。"
          action={
            <Button size="small" onClick={() => void refetchDetail()}>
              重试
            </Button>
          }
        />
      ) : null}
      {resolvedOrder?.hasSourceAmountMismatch ? (
        <Alert
          type="warning"
          showIcon
          title="来源差异警示"
          description="客源单金额与已生成的应收节点不一致，且财务已介入，请核对后再处理。"
          style={{ marginBottom: 16 }}
        />
      ) : null}
      {detailReady && !detailError ? (
      <Form
        key={formKey}
        form={form}
        layout="vertical"
        disabled={readOnly}
        initialValues={initialValues}
        onFinish={(values) => {
          const pathBaseline: SourceOrderPathBaseline | null = resolvedOrder
            ? {
                guestCollectCents: resolvedOrder.guestCollectCents,
                partnerCollectedCents: resolvedOrder.partnerCollectedCents,
              }
            : null
          const generateReceivable = submitIntentRef.current === 'saveAndGenerate'
          resetSubmitIntent()
          onSubmit(formValuesToPayload(values), pathBaseline, {
            generateReceivable,
          })
        }}
        onFinishFailed={resetSubmitIntent}
      >
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          基础信息
        </Typography.Title>
        <Form.Item
          name="partnerId"
          label="客户"
          rules={[{ required: true, message: '请选择客户' }]}
        >
          <Select
            showSearch
            placeholder="选择合作伙伴"
            optionFilterProp="label"
            options={partnersResult?.items.map((partner) => ({
              value: partner.id,
              label: partner.name,
            }))}
          />
        </Form.Item>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="adultGuestCount"
              label="成人人数"
              rules={[
                { required: true, message: '请输入成人人数' },
                {
                  type: 'number',
                  min: 0,
                  message: '成人人数不能为负数',
                },
                ({ getFieldValue }) => ({
                  validator: totalGuestCountAtLeastOne(getFieldValue),
                }),
              ]}
              dependencies={['childGuestCount']}
            >
              <InputNumber
                min={0}
                precision={0}
                style={{ width: '100%' }}
                disabled={lockAmounts}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="childGuestCount"
              label="儿童人数"
              rules={[
                {
                  type: 'number',
                  min: 0,
                  message: '儿童人数不能为负数',
                },
                ({ getFieldValue }) => ({
                  validator: totalGuestCountAtLeastOne(getFieldValue),
                }),
              ]}
              dependencies={['adultGuestCount']}
            >
              <InputNumber
                min={0}
                precision={0}
                style={{ width: '100%' }}
                disabled={lockAmounts}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="总人数">
              <InputNumber
                value={derivedTotalGuests}
                precision={0}
                style={{ width: '100%' }}
                disabled
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="notes" label="备注">
          <Input.TextArea rows={2} placeholder="免票、特殊要求等" />
        </Form.Item>

        <Divider />
        <Typography.Title level={5}>团款与优惠</Typography.Title>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="adultUnitPriceYuan"
              label="成人团款单价（元）"
              rules={[{ required: true, message: '请输入成人团款单价' }]}
            >
              <InputNumber
                min={0}
                precision={2}
                style={{ width: '100%' }}
                disabled={lockAmounts}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="childUnitPriceYuan"
              label="儿童团款单价（元）"
              rules={[unitPriceRequiredWhenCountPositive('childGuestCount')]}
              dependencies={['childGuestCount']}
            >
              <InputNumber
                min={0}
                precision={2}
                style={{ width: '100%' }}
                disabled={lockAmounts}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="原始团款金额（元）">
              <InputNumber
                value={derivedGrossYuan}
                precision={2}
                style={{ width: '100%' }}
                disabled
              />
            </Form.Item>
          </Col>
        </Row>

        <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
          团款调整项
        </Typography.Text>
        <Form.List name="fareAdjustments">
          {(fields, { add, remove }) => (
            <Space direction="vertical" size={12} style={{ width: '100%', marginBottom: 16 }}>
              {fields.map((field) => {
                const kind = fareAdjustments[field.name]?.kind
                const isCustom = kind === FareAdjustmentKind.CUSTOM
                const directionLocked = Boolean(kind) && !isCustom
                return (
                  <div
                    key={field.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isCustom
                        ? '140px 1fr 100px 110px 32px'
                        : '160px 100px 110px 32px',
                      gap: 8,
                      alignItems: 'start',
                    }}
                  >
                    <Form.Item
                      {...field}
                      name={[field.name, 'kind']}
                      rules={[{ required: true, message: '请选择种类' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        options={FARE_ADJUSTMENT_KIND_OPTIONS.filter(
                          (option) =>
                            option.value === FareAdjustmentKind.CUSTOM ||
                            option.value === kind ||
                            !usedFixedKinds.has(option.value),
                        )}
                        disabled={lockAmounts}
                        onChange={(nextKind: FareAdjustmentKind) => {
                          form.setFieldValue(
                            ['fareAdjustments', field.name, 'direction'],
                            defaultDirectionForFareAdjustmentKind(nextKind),
                          )
                          if (nextKind !== FareAdjustmentKind.CUSTOM) {
                            form.setFieldValue(
                              ['fareAdjustments', field.name, 'customName'],
                              undefined,
                            )
                          }
                        }}
                      />
                    </Form.Item>
                    {isCustom ? (
                      <Form.Item
                        {...field}
                        name={[field.name, 'customName']}
                        rules={[{ required: true, message: '请填写名称' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <Input placeholder="自定义名称" disabled={lockAmounts} />
                      </Form.Item>
                    ) : null}
                    <Form.Item
                      {...field}
                      name={[field.name, 'direction']}
                      rules={[{ required: true, message: '请选择方向' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        options={[...FARE_ADJUSTMENT_DIRECTION_OPTIONS]}
                        disabled={lockAmounts || directionLocked}
                      />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'amountYuan']}
                      rules={[
                        { required: true, message: '请输入金额' },
                        {
                          type: 'number',
                          min: 0.01,
                          message: '金额必须大于0',
                        },
                      ]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber
                        min={0.01}
                        precision={2}
                        style={{ width: '100%' }}
                        disabled={lockAmounts}
                        placeholder="金额"
                      />
                    </Form.Item>
                    {!lockAmounts && !readOnly ? (
                      <Button
                        type="text"
                        danger
                        icon={<MinusCircleOutlined />}
                        aria-label="删除团款调整项"
                        onClick={() => remove(field.name)}
                      />
                    ) : (
                      <span />
                    )}
                  </div>
                )
              })}
              {!lockAmounts && !readOnly ? (
                <Space>
                  <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      const nextFixed = FARE_ADJUSTMENT_KIND_OPTIONS.find(
                        (option) =>
                          option.value !== FareAdjustmentKind.CUSTOM &&
                          !usedFixedKinds.has(option.value),
                      )
                      const kind = nextFixed?.value ?? FareAdjustmentKind.CUSTOM
                      add({
                        kind,
                        direction: defaultDirectionForFareAdjustmentKind(kind),
                      })
                    }}
                  >
                    添加调整项
                  </Button>
                  <Typography.Text type="secondary">
                    调整净额 ¥{derivedAdjustmentNetYuan.toFixed(2)}
                  </Typography.Text>
                </Space>
              ) : (
                <Typography.Text type="secondary">
                  调整净额 ¥{derivedAdjustmentNetYuan.toFixed(2)}
                  {fields.length === 0 ? '（无）' : null}
                </Typography.Text>
              )}
            </Space>
          )}
        </Form.List>

        <Form.Item
          name="discountType"
          label="优惠方式"
          rules={[{ required: true, message: '请选择优惠方式' }]}
        >
          <Select
            options={[...SOURCE_ORDER_DISCOUNT_OPTIONS]}
            disabled={lockAmounts}
          />
        </Form.Item>
        {discountType === SourceOrderDiscountType.LUMP_SUM ? (
          <Form.Item
            name="discountYuan"
            label="优惠金额（元）"
            rules={[{ required: true, message: '请输入优惠金额' }]}
          >
            <InputNumber
              min={0}
              precision={2}
              style={{ width: '100%' }}
              disabled={lockAmounts}
            />
          </Form.Item>
        ) : null}
        <Form.Item name="discountNotes" label="优惠备注">
          <Input.TextArea rows={2} placeholder="请输入优惠相关备注（选填）" />
        </Form.Item>

        <Divider />
        <Typography.Title level={5}>收款信息</Typography.Title>
        <Form.Item
          name="collectionMode"
          label="收款方式"
          rules={[{ required: true, message: '请选择收款方式' }]}
        >
          <Select
            options={[...SOURCE_ORDER_COLLECTION_OPTIONS]}
            disabled={lockAmounts}
          />
        </Form.Item>
        {collectionMode === SourceOrderCollectionMode.SPLIT ? (
          <Form.Item
            name="partnerCollectedYuan"
            label="客户已收金额（元）"
            rules={[{ required: true, message: '请输入客户已收金额' }]}
          >
            <InputNumber
              min={0}
              precision={2}
              style={{ width: '100%' }}
              disabled={lockAmounts}
            />
          </Form.Item>
        ) : null}
        <Form.Item name="settlementNotes" label="结算说明">
          <Input.TextArea rows={2} placeholder="请输入结算说明（选填）" />
        </Form.Item>
      </Form>
      ) : null}
    </Drawer>
  )
}
