import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import {
  Alert,
  Col,
  Divider,
  Drawer,
  Flex,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Typography,
  Button,
  theme,
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

function FormSection({
  title,
  description,
  children,
  first = false,
}: {
  title: string
  description?: string
  children: ReactNode
  first?: boolean
}) {
  const { token } = theme.useToken()
  return (
    <section>
      {!first ? <Divider style={{ margin: `${token.marginLG}px 0` }} /> : null}
      <Typography.Title
        level={5}
        style={{
          marginTop: 0,
          marginBottom: description ? token.marginXXS : token.marginSM,
        }}
      >
        {title}
      </Typography.Title>
      {description ? (
        <Typography.Paragraph
          type="secondary"
          style={{ marginBottom: token.marginMD, fontSize: token.fontSizeSM }}
        >
          {description}
        </Typography.Paragraph>
      ) : null}
      {children}
    </section>
  )
}

function DerivedMetric({ label, value }: { label: string; value: string }) {
  const { token } = theme.useToken()
  return (
    <Flex justify="space-between" align="baseline" style={{ marginBottom: token.marginSM }}>
      <Typography.Text type="secondary">{label}</Typography.Text>
      <Typography.Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography.Text>
    </Flex>
  )
}

function formatYuan(yuan: number): string {
  return `¥${yuan.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatSignedYuan(yuan: number): string {
  if (yuan > 0) {
    return `+${formatYuan(yuan)}`
  }
  if (yuan < 0) {
    return `−${formatYuan(Math.abs(yuan))}`
  }
  return formatYuan(0)
}

function AmountPipeline({
  grossYuan,
  adjustmentNetYuan,
  discountYuan,
  settlementYuan,
}: {
  grossYuan: number
  adjustmentNetYuan: number
  discountYuan: number
  settlementYuan: number
}) {
  const { token } = theme.useToken()

  return (
    <div
      style={{
        marginTop: token.marginXS,
        marginBottom: token.marginMD,
        padding: `${token.paddingXS}px ${token.paddingSM}px`,
        background: token.colorFillAlter,
        borderRadius: token.borderRadiusLG,
      }}
    >
      <Flex wrap="wrap" gap={token.marginXS} align="center">
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          原始 {formatYuan(grossYuan)}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          ·
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          调整 {formatSignedYuan(adjustmentNetYuan)}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          ·
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          优惠 −{formatYuan(discountYuan)}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          ·
        </Typography.Text>
        <Typography.Text strong style={{ fontSize: token.fontSizeSM, fontVariantNumeric: 'tabular-nums' }}>
          结算 {formatYuan(settlementYuan)}
        </Typography.Text>
      </Flex>
    </div>
  )
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
      depositYuan: watched.depositYuan,
      balanceYuan: watched.balanceYuan,
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
    <Typography.Text
      type="secondary"
      style={{ whiteSpace: 'pre-line', display: 'block', lineHeight: 1.6 }}
    >
      {formatSourceOrderAmountSummary({ ...amounts, collectionMode }, formatCents)}
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

function FareAdjustmentsEditor({
  form,
  lockAmounts,
  readOnly,
  fareAdjustments,
  usedFixedKinds,
  adjustmentNetYuan,
}: {
  form: ReturnType<typeof Form.useForm<SourceOrderFormValues>>[0]
  lockAmounts: boolean
  readOnly: boolean
  fareAdjustments: SourceOrderFormValues['fareAdjustments']
  usedFixedKinds: Set<FareAdjustmentKind>
  adjustmentNetYuan: number
}) {
  const { token } = theme.useToken()
  const canEdit = !lockAmounts && !readOnly

  return (
    <Form.List name="fareAdjustments">
      {(fields, { add, remove }) => (
        <Space orientation="vertical" size={token.marginSM} style={{ width: '100%' }}>
          {fields.length > 0 ? (
            <Row gutter={8} style={{ marginBottom: -token.marginXXS }}>
              <Col span={10}>
                <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  种类
                </Typography.Text>
              </Col>
              <Col span={6}>
                <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  方向
                </Typography.Text>
              </Col>
              <Col span={6}>
                <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  金额（元）
                </Typography.Text>
              </Col>
              <Col span={2} />
            </Row>
          ) : null}

          {fields.map(({ key, name, ...restField }) => {
            const kind = fareAdjustments[name]?.kind
            const isOther = kind === FareAdjustmentKind.OTHER
            const directionLocked = Boolean(kind) && !isOther
            return (
              <div
                key={key}
                data-testid="fare-adjustment-row"
                style={{
                  padding: token.paddingSM,
                  background: token.colorFillAlter,
                  borderRadius: token.borderRadiusLG,
                }}
              >
                <Row gutter={[8, 8]} align="top">
                  <Col span={10}>
                    <Form.Item
                      {...restField}
                      name={[name, 'kind']}
                      rules={[{ required: true, message: '请选择种类' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        options={FARE_ADJUSTMENT_KIND_OPTIONS.filter(
                          (option) =>
                            option.value === FareAdjustmentKind.OTHER ||
                            option.value === kind ||
                            !usedFixedKinds.has(option.value),
                        )}
                        disabled={lockAmounts}
                        placeholder="种类"
                        onChange={(nextKind: FareAdjustmentKind) => {
                          form.setFieldValue(
                            ['fareAdjustments', name, 'direction'],
                            defaultDirectionForFareAdjustmentKind(nextKind),
                          )
                          if (nextKind !== FareAdjustmentKind.OTHER) {
                            form.setFieldValue(
                              ['fareAdjustments', name, 'customName'],
                              undefined,
                            )
                          }
                        }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item
                      {...restField}
                      name={[name, 'direction']}
                      rules={[{ required: true, message: '请选择方向' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        options={[...FARE_ADJUSTMENT_DIRECTION_OPTIONS]}
                        disabled={lockAmounts || directionLocked}
                        placeholder="方向"
                      />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item
                      {...restField}
                      name={[name, 'amountYuan']}
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
                        placeholder="0.00"
                      />
                    </Form.Item>
                  </Col>
                  <Col span={2}>
                    {canEdit ? (
                      <Button
                        type="text"
                        danger
                        icon={<MinusCircleOutlined />}
                        aria-label="删除团款调整项"
                        onClick={() => remove(name)}
                        style={{ marginTop: 0 }}
                      />
                    ) : null}
                  </Col>
                  {isOther ? (
                    <Col span={22}>
                      <Form.Item
                        {...restField}
                        name={[name, 'customName']}
                        rules={[{ required: true, message: '请填写调整说明' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <Input placeholder="调整说明" disabled={lockAmounts} />
                      </Form.Item>
                    </Col>
                  ) : null}
                </Row>
              </div>
            )
          })}

          <Flex justify="space-between" align="center" gap={token.marginSM} wrap="wrap">
            {canEdit ? (
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => {
                  const nextFixed = FARE_ADJUSTMENT_KIND_OPTIONS.find(
                    (option) =>
                      option.value !== FareAdjustmentKind.OTHER &&
                      !usedFixedKinds.has(option.value),
                  )
                  const kind = nextFixed?.value ?? FareAdjustmentKind.OTHER
                  add({
                    kind,
                    direction: defaultDirectionForFareAdjustmentKind(kind),
                  })
                }}
              >
                添加调整项
              </Button>
            ) : (
              <span />
            )}
            <Typography.Text
              type="secondary"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              调整净额{' '}
              <Typography.Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                ¥{adjustmentNetYuan.toFixed(2)}
              </Typography.Text>
              {!canEdit && fields.length === 0 ? '（无）' : null}
            </Typography.Text>
          </Flex>
        </Space>
      )}
    </Form.List>
  )
}

interface SourceOrderFormFieldsProps {
  form: ReturnType<typeof Form.useForm<SourceOrderFormValues>>[0]
  partnerOptions: Array<{ value: string; label: string }>
  lockAmounts: boolean
  readOnly: boolean
  derivedTotalGuests: number
  derivedGrossYuan: number
  fareAdjustments: SourceOrderFormValues['fareAdjustments']
  usedFixedKinds: Set<FareAdjustmentKind>
  derivedAdjustmentNetYuan: number
  discountType: SourceOrderDiscountType | undefined
  showAmountPipeline: boolean
  derivedDiscountYuan: number
  derivedSettlementYuan: number
  collectionMode: SourceOrderCollectionMode | undefined
}

function SourceOrderFormFields({
  form,
  partnerOptions,
  lockAmounts,
  readOnly,
  derivedTotalGuests,
  derivedGrossYuan,
  fareAdjustments,
  usedFixedKinds,
  derivedAdjustmentNetYuan,
  discountType,
  showAmountPipeline,
  derivedDiscountYuan,
  derivedSettlementYuan,
  collectionMode,
}: SourceOrderFormFieldsProps) {
  const { token } = theme.useToken()

  return (
    <>
      <FormSection title="基础信息" first>
        <Form.Item
          name="partnerId"
          label="客户"
          rules={[{ required: true, message: '请选择客户' }]}
        >
          <Select
            showSearch={{ optionFilterProp: 'label' }}
            placeholder="选择合作伙伴"
            options={partnerOptions}
          />
        </Form.Item>
        <Row gutter={token.marginMD}>
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
              <Input
                aria-label="总人数"
                value={`${derivedTotalGuests} 人`}
                readOnly
                disabled
              />
            </Form.Item>
          </Col>
        </Row>
      </FormSection>

      <FormSection title="团款计价" description="按人数与单价计算原始团款，再叠加调整与优惠。">
        <Row gutter={token.marginMD}>
          <Col span={12}>
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
          <Col span={12}>
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
        </Row>
        <DerivedMetric label="原始团款金额" value={`¥${derivedGrossYuan.toFixed(2)}`} />
      </FormSection>

      <FormSection
        title="团款调整"
        description="加收或扣减项；多数单据可跳过。固定种类每项最多一行，其他费用调整可多行。"
      >
        <FareAdjustmentsEditor
          form={form}
          lockAmounts={lockAmounts}
          readOnly={readOnly}
          fareAdjustments={fareAdjustments}
          usedFixedKinds={usedFixedKinds}
          adjustmentNetYuan={derivedAdjustmentNetYuan}
        />
      </FormSection>

      <FormSection title="优惠">
        <Form.Item
          name="discountType"
          label="优惠方式"
          rules={[{ required: true, message: '请选择优惠方式' }]}
        >
          <Select options={[...SOURCE_ORDER_DISCOUNT_OPTIONS]} disabled={lockAmounts} />
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
        {showAmountPipeline ? (
          <AmountPipeline
            grossYuan={derivedGrossYuan}
            adjustmentNetYuan={derivedAdjustmentNetYuan}
            discountYuan={derivedDiscountYuan}
            settlementYuan={derivedSettlementYuan}
          />
        ) : null}
      </FormSection>

      <FormSection
        title="收款信息"
        description="按定金/尾款录入代收约定；地接与合作方往来只看我方代收与结算金额，客户已收不计入客户补款。"
      >
        <Form.Item
          name="collectionMode"
          label="收款方式"
          rules={[{ required: true, message: '请选择收款方式' }]}
        >
          <Select options={[...SOURCE_ORDER_COLLECTION_OPTIONS]} disabled={lockAmounts} />
        </Form.Item>
        {collectionMode === SourceOrderCollectionMode.GUEST_ONLY ||
        collectionMode === SourceOrderCollectionMode.SPLIT ? (
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="depositYuan"
                label={
                  collectionMode === SourceOrderCollectionMode.SPLIT
                    ? '客户已收定金（元）'
                    : '定金（元）'
                }
                rules={[{ required: true, message: '请输入定金' }]}
              >
                <InputNumber
                  min={0}
                  precision={2}
                  style={{ width: '100%' }}
                  disabled={lockAmounts}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="balanceYuan"
                label={
                  collectionMode === SourceOrderCollectionMode.SPLIT
                    ? '我方代收尾款（元）'
                    : '尾款（元）'
                }
                rules={[{ required: true, message: '请输入尾款' }]}
              >
                <InputNumber
                  min={0}
                  precision={2}
                  style={{ width: '100%' }}
                  disabled={lockAmounts}
                />
              </Form.Item>
            </Col>
          </Row>
        ) : null}
        <Form.Item name="settlementNotes" label="结算说明">
          <Input.TextArea rows={2} placeholder="请输入结算说明（选填）" />
        </Form.Item>
      </FormSection>

      <FormSection title="备注">
        <Form.Item name="notes">
          <Input.TextArea
            rows={2}
            placeholder="免票、特殊要求等"
            aria-label="备注"
          />
        </Form.Item>
      </FormSection>
    </>
  )
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
  const { token } = theme.useToken()
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
  const discountYuan = Form.useWatch('discountYuan', form)
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
    discountYuan,
    collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
    fareAdjustments,
  })
  const derivedGrossYuan = derivedAmounts.grossReceivableCents / 100
  const derivedAdjustmentNetYuan = derivedAmounts.fareAdjustmentNetCents / 100
  const derivedDiscountYuan = derivedAmounts.discountCents / 100
  const derivedSettlementYuan = derivedAmounts.netReceivableCents / 100
  const usedFixedKinds = new Set(
    fareAdjustments
      .map((item) => item?.kind)
      .filter((kind): kind is FareAdjustmentKind => Boolean(kind) && kind !== FareAdjustmentKind.OTHER),
  )
  const showAmountPipeline = derivedTotalGuests >= 1

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
      size={600}
      onClose={handleClose}
      destroyOnHidden
      loading={drawerLoading}
      styles={{ footer: { paddingBlock: token.paddingMD } }}
      footer={
        detailError && sourceOrderId ? null : (
          <Flex vertical gap={token.marginSM} style={{ width: '100%' }}>
            {detailReady ? <AmountPreview form={form} /> : null}
            {readOnly ? (
              <Flex justify="flex-end">
                <Button onClick={handleClose}>关闭</Button>
              </Flex>
            ) : (
              <Flex justify="flex-end">
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
              </Flex>
            )}
          </Flex>
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
          style={{ marginBottom: token.marginMD }}
        />
      ) : null}
      {detailReady && !detailError ? (
        <Form
          key={formKey}
          form={form}
          layout="vertical"
          disabled={readOnly}
          scrollToFirstError={{ focus: true }}
          initialValues={initialValues}
          onFinish={(values) => {
            const pathBaseline: SourceOrderPathBaseline | null = resolvedOrder
              ? {
                  guestCollectCents: resolvedOrder.guestCollectCents,
                  partnerCollectedCents: resolvedOrder.partnerCollectedCents,
                  depositCents: resolvedOrder.depositCents,
                  balanceCents: resolvedOrder.balanceCents,
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
          <SourceOrderFormFields
            form={form}
            partnerOptions={
              partnersResult?.items.map((partner) => ({
                value: partner.id,
                label: partner.name,
              })) ?? []
            }
            lockAmounts={lockAmounts}
            readOnly={readOnly}
            derivedTotalGuests={derivedTotalGuests}
            derivedGrossYuan={derivedGrossYuan}
            fareAdjustments={fareAdjustments}
            usedFixedKinds={usedFixedKinds}
            derivedAdjustmentNetYuan={derivedAdjustmentNetYuan}
            discountType={discountType}
            showAmountPipeline={showAmountPipeline}
            derivedDiscountYuan={derivedDiscountYuan}
            derivedSettlementYuan={derivedSettlementYuan}
            collectionMode={collectionMode}
          />
        </Form>
      ) : null}
    </Drawer>
  )
}
