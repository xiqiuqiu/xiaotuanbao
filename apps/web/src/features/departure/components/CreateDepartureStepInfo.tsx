import { useState, type CSSProperties } from 'react'
import { CalendarOutlined, CopyOutlined, FileTextOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Typography,
  theme,
} from 'antd'
import type { FormInstance } from 'antd/es/form'
import { useQuery } from '@tanstack/react-query'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { DirectoryProfileStatus, ResourceKind } from '@xiaotuanbao/shared'
import type { SupplierSummary } from '@/types/api'
import { listEmployeeOptions } from '@/services/employee.service'
import { listSuppliers } from '@/services/supplier.service'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { DEPARTURE_TYPE_OPTIONS } from '../catalog'
import type { InfoFormValues, RouteStepValues } from '../utils/departure-wizard-form'
import {
  buildDefaultDepartureName,
  buildRouteSummary,
  computeDayCount,
  computeEndDateFromDefaultDays,
  isEndDateBeforeStartDate,
} from '../utils/departure-wizard-form'
import { SupplierQuickCreateSelect } from './SupplierQuickCreateSelect'
import styles from './CreateDepartureStepInfo.module.css'

interface CreateDepartureStepInfoProps {
  form: FormInstance<InfoFormValues>
  route: RouteStepValues
  onValuesChange?: () => void
}

function toDayjs(value?: string): Dayjs | null {
  return value ? dayjs(value) : null
}

interface DepartureInfoFormProps {
  form: FormInstance<InfoFormValues>
  employeeOptions: Array<{ value: string; label: string }>
  helperTextStyle: CSSProperties
  hasSupplierError: boolean
  onRetrySuppliers: () => void
  driverSuppliers: SupplierSummary[]
  driverSearch: string
  onDriverSearch: (value: string) => void
  isDriverSuppliersLoading: boolean
  guideSuppliers: SupplierSummary[]
  guideSearch: string
  onGuideSearch: (value: string) => void
  isGuideSuppliersLoading: boolean
  onStartDateChange: (value: Dayjs | null) => void
  onEndDateChange: (value: Dayjs | null) => void
  onValuesChange?: () => void
}

function DepartureInfoForm({
  form,
  employeeOptions,
  helperTextStyle,
  hasSupplierError,
  onRetrySuppliers,
  driverSuppliers,
  driverSearch,
  onDriverSearch,
  isDriverSuppliersLoading,
  guideSuppliers,
  guideSearch,
  onGuideSearch,
  isGuideSuppliersLoading,
  onStartDateChange,
  onEndDateChange,
  onValuesChange,
}: DepartureInfoFormProps) {
  return (
    <>
      <div className={styles.sectionHeader}>
        <Typography.Title level={5}>发团基础信息</Typography.Title>
        <Typography.Paragraph style={helperTextStyle}>
          团名默认取「出团日期 + 路线名称」；变更出团日期时会同步调整，也可按本次实际团期改写。
        </Typography.Paragraph>
      </div>

      <Form form={form} layout="vertical" onValuesChange={onValuesChange}>
        {hasSupplierError ? (
          <Alert
            type="error"
            showIcon
            title="执行班组供应商加载失败"
            description="请检查网络后重试"
            action={
              <Button size="small" onClick={onRetrySuppliers}>
                重试
              </Button>
            }
            style={{ marginBottom: 16 }}
          />
        ) : null}

        <Row gutter={16}>
          <Col xs={24} md={16}>
            <Form.Item name="name" label="团名" rules={[{ required: true, message: '请输入团名' }]}>
              <Input placeholder="出团日期 + 路线名称，可按实际调整" />
            </Form.Item>
          </Col>

          <Col xs={24} md={8}>
            <Form.Item name="departureNo" label="团号">
              <Input disabled placeholder="系统自动分配" />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item
              name="departureType"
              label="发团类型"
              rules={[{ required: true, message: '请选择发团类型' }]}
            >
              <Select options={[...DEPARTURE_TYPE_OPTIONS]} />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item
              name="ownerUserId"
              label="负责人"
              rules={[{ required: true, message: '请选择负责人' }]}
            >
              <Select
                showSearch={{ optionFilterProp: 'label' }}
                options={employeeOptions}
                placeholder="选择负责人"
              />
            </Form.Item>
          </Col>

          <Col xs={24} md={10}>
            <Form.Item
              name="startDate"
              label="出团日期"
              rules={[{ required: true, message: '请选择出团日期' }]}
              getValueProps={(value: string | undefined) => ({ value: toDayjs(value) })}
            >
              <DatePicker className={styles.fullWidth} onChange={onStartDateChange} />
            </Form.Item>
          </Col>

          <Col xs={24} md={10}>
            <Form.Item
              name="endDate"
              label="结束日期"
              dependencies={['startDate']}
              rules={[
                { required: true, message: '请选择结束日期' },
                ({ getFieldValue }) => ({
                  validator(_rule, value: string | undefined) {
                    const startDate = getFieldValue('startDate') as string | undefined
                    if (!startDate || !value) return Promise.resolve()
                    if (isEndDateBeforeStartDate(startDate, value)) {
                      return Promise.reject(new Error('结束日期不能早于出团日期'))
                    }
                    return Promise.resolve()
                  },
                }),
              ]}
              getValueProps={(value: string | undefined) => ({ value: toDayjs(value) })}
            >
              <DatePicker className={styles.fullWidth} onChange={onEndDateChange} />
            </Form.Item>
          </Col>

          <Col xs={24} md={4}>
            <Form.Item name="dayCount" label="天数">
              <Input disabled />
            </Form.Item>
          </Col>

          <Col span={24}>
            <Typography.Text className={styles.crewHint} style={helperTextStyle}>
              选择执行班组（司机、导游）不会自动提交应付
            </Typography.Text>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item name="driverSupplierId" label="司机">
              <SupplierQuickCreateSelect
                category={ResourceKind.TRANSPORT}
                suppliers={driverSuppliers}
                searchValue={driverSearch}
                onSearch={onDriverSearch}
                loading={isDriverSuppliersLoading}
                placeholder="选择含「用车」类别的供应商"
                emptyHint="暂无匹配供应商，请先到供应商名录维护「用车」类别"
              />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item name="guideSupplierId" label="导游">
              <SupplierQuickCreateSelect
                category={ResourceKind.GUIDE}
                suppliers={guideSuppliers}
                searchValue={guideSearch}
                onSearch={onGuideSearch}
                loading={isGuideSuppliersLoading}
                placeholder="选择含「导游」类别的供应商"
                emptyHint="暂无匹配供应商，请先到供应商名录维护「导游」类别"
              />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item name="vehiclePlate" label="车牌">
              <Input placeholder="如：新A·12345" maxLength={32} />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item name="contactPhone" label="联系电话">
              <Input type="tel" inputMode="tel" placeholder="如：13800138000" maxLength={32} />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item
              name="expectedGuestCountHint"
              label="预计人数提示"
              extra="仅保存在发团创建草稿，不写入正式发团人数或备注"
            >
              <InputNumber min={0} max={9999} precision={0} style={{ width: '100%' }} placeholder="可选" />
            </Form.Item>
          </Col>

          <Col span={24}>
            <Form.Item name="notes" label="备注">
              <Input.TextArea rows={3} placeholder="如：客人集合时间、特殊接待要求" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </>
  )
}

interface DepartureSummaryProps {
  route: RouteStepValues
  copySummary: string | null
  helperTextStyle: CSSProperties
}

function DepartureSummary({ route, copySummary, helperTextStyle }: DepartureSummaryProps) {
  return (
    <Card size="small" title="本次发团摘要" className={styles.summaryCard}>
      <Space orientation="vertical" size={16} className={styles.summaryContent}>
        <div>
          <Typography.Text style={helperTextStyle}>所选路线</Typography.Text>
          <Typography.Title level={5} className={styles.routeName}>
            {route.routeName || '-'}
          </Typography.Title>
        </div>

        <Space orientation="vertical" size={12}>
          <Typography.Text>
            <CalendarOutlined className={styles.summaryIcon} aria-hidden />
            默认 {route.defaultDayCount ? `${route.defaultDayCount} 天` : '未设置天数'}
          </Typography.Text>
          {route.mode === 'template' ? (
            <Typography.Text>
              <FileTextOutlined className={styles.summaryIcon} aria-hidden />
              路线内容将在创建后带入
            </Typography.Text>
          ) : null}
          {route.mode === 'copy' ? (
            <Typography.Text>
              <CopyOutlined className={styles.summaryIcon} aria-hidden />
              复制已有发团的行程与资源
            </Typography.Text>
          ) : null}
        </Space>

        {copySummary ? (
          <div className={styles.copySummary}>
            <Typography.Text style={helperTextStyle}>{copySummary}</Typography.Text>
          </div>
        ) : null}

        <Typography.Text className={styles.numberHint} style={helperTextStyle}>
          团号由系统按创建年月自动分配，创建后不可修改。
        </Typography.Text>
      </Space>
    </Card>
  )
}

export function CreateDepartureStepInfo({
  form,
  route,
  onValuesChange,
}: CreateDepartureStepInfoProps) {
  const { token } = theme.useToken()
  const defaultDayCount = route.defaultDayCount
  const copySummary = buildRouteSummary(route)
  const [driverSearch, setDriverSearch] = useState('')
  const [guideSearch, setGuideSearch] = useState('')
  const debouncedDriverSearch = useDebouncedValue(driverSearch.trim())
  const debouncedGuideSearch = useDebouncedValue(guideSearch.trim())
  const helperTextStyle = { color: token.colorTextSecondary }

  const { data: employeeOptionsResult } = useQuery({
    queryKey: ['employees', 'options', 'create-departure'],
    queryFn: () => listEmployeeOptions(),
  })
  const {
    data: driverSuppliersResult,
    isLoading: isDriverSuppliersLoading,
    isError: isDriverSuppliersError,
    refetch: refetchDriverSuppliers,
  } = useQuery({
    queryKey: ['suppliers', 'create-departure-crew', ResourceKind.TRANSPORT, debouncedDriverSearch],
    queryFn: () =>
      listSuppliers({
        search: debouncedDriverSearch || undefined,
        category: ResourceKind.TRANSPORT,
        status: DirectoryProfileStatus.ACTIVE,
        pageSize: 100,
      }),
  })
  const {
    data: guideSuppliersResult,
    isLoading: isGuideSuppliersLoading,
    isError: isGuideSuppliersError,
    refetch: refetchGuideSuppliers,
  } = useQuery({
    queryKey: ['suppliers', 'create-departure-crew', ResourceKind.GUIDE, debouncedGuideSearch],
    queryFn: () =>
      listSuppliers({
        search: debouncedGuideSearch || undefined,
        category: ResourceKind.GUIDE,
        status: DirectoryProfileStatus.ACTIVE,
        pageSize: 100,
      }),
  })

  const employeeOptions =
    employeeOptionsResult?.map((employee) => ({
      value: employee.id,
      label: employee.name,
    })) ?? []

  const handleStartDateChange = (value: Dayjs | null) => {
    const startDate = value?.format('YYYY-MM-DD')
    if (!startDate) return

    const updates: Partial<InfoFormValues> = { startDate }
    const routeName = route.routeName.trim()
    if (routeName) updates.name = buildDefaultDepartureName(routeName, startDate)

    if (defaultDayCount && defaultDayCount > 0) {
      updates.endDate = computeEndDateFromDefaultDays(startDate, defaultDayCount)
      updates.dayCount = defaultDayCount
    } else {
      const currentEndDate = form.getFieldValue('endDate') as string | undefined
      if (currentEndDate) updates.dayCount = computeDayCount(startDate, currentEndDate)
    }

    form.setFieldsValue(updates)
    void form.validateFields(['endDate']).catch(() => undefined)
  }

  const handleEndDateChange = (value: Dayjs | null) => {
    const endDate = value?.format('YYYY-MM-DD')
    if (!endDate) return

    const startDate = form.getFieldValue('startDate') as string | undefined
    form.setFieldsValue({
      endDate,
      dayCount: startDate ? computeDayCount(startDate, endDate) : undefined,
    })
    void form.validateFields(['endDate']).catch(() => undefined)
  }

  return (
    <div
      className={styles.infoStep}
      style={
        {
          '--info-fill': token.colorFillAlter,
          '--info-border': token.colorBorderSecondary,
          '--info-radius': `${token.borderRadius}px`,
          '--info-secondary': token.colorTextSecondary,
        } as CSSProperties
      }
    >
      <Row gutter={[32, 24]}>
        <Col xs={24} xl={16}>
          <DepartureInfoForm
            form={form}
            employeeOptions={employeeOptions}
            helperTextStyle={helperTextStyle}
            hasSupplierError={isDriverSuppliersError || isGuideSuppliersError}
            onRetrySuppliers={() => {
              void Promise.all([refetchDriverSuppliers(), refetchGuideSuppliers()])
            }}
            driverSuppliers={driverSuppliersResult?.items ?? []}
            driverSearch={driverSearch}
            onDriverSearch={setDriverSearch}
            isDriverSuppliersLoading={isDriverSuppliersLoading}
            guideSuppliers={guideSuppliersResult?.items ?? []}
            guideSearch={guideSearch}
            onGuideSearch={setGuideSearch}
            isGuideSuppliersLoading={isGuideSuppliersLoading}
            onStartDateChange={handleStartDateChange}
            onEndDateChange={handleEndDateChange}
            onValuesChange={onValuesChange}
          />
        </Col>

        <Col xs={24} xl={8}>
          <DepartureSummary
            route={route}
            copySummary={copySummary}
            helperTextStyle={helperTextStyle}
          />
        </Col>
      </Row>
    </div>
  )
}
