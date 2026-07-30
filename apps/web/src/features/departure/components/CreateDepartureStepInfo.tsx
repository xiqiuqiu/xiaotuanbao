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
} from '../utils/departure-wizard-form'
import styles from './CreateDepartureStepInfo.module.css'

interface CreateDepartureStepInfoProps {
  form: FormInstance<InfoFormValues>
  route: RouteStepValues
}

function toDayjs(value?: string): Dayjs | null {
  return value ? dayjs(value) : null
}

export function CreateDepartureStepInfo({ form, route }: CreateDepartureStepInfoProps) {
  const { token } = theme.useToken()
  const defaultDayCount = route.defaultDayCount
  const copySummary = buildRouteSummary(route)
  const [driverSearch, setDriverSearch] = useState('')
  const [guideSearch, setGuideSearch] = useState('')
  const debouncedDriverSearch = useDebouncedValue(driverSearch.trim())
  const debouncedGuideSearch = useDebouncedValue(guideSearch.trim())

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
  const driverOptions =
    driverSuppliersResult?.items.map((supplier) => ({
      value: supplier.id,
      label: supplier.name,
    })) ?? []
  const guideOptions =
    guideSuppliersResult?.items.map((supplier) => ({
      value: supplier.id,
      label: supplier.name,
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
  }

  const handleEndDateChange = (value: Dayjs | null) => {
    const endDate = value?.format('YYYY-MM-DD')
    if (!endDate) return

    const startDate = form.getFieldValue('startDate') as string | undefined
    form.setFieldsValue({
      endDate,
      dayCount: startDate ? computeDayCount(startDate, endDate) : undefined,
    })
  }

  return (
    <div
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
        <div className={styles.sectionHeader}>
          <Typography.Title level={5}>发团基础信息</Typography.Title>
          <Typography.Paragraph type="secondary">
            团名默认取「出团日期 + 路线名称」；变更出团日期时会同步调整，也可按本次实际团期改写。
          </Typography.Paragraph>
        </div>

        <Form form={form} layout="vertical">
          {isDriverSuppliersError || isGuideSuppliersError ? (
            <Alert
              type="error"
              showIcon
              title="执行班组供应商加载失败"
              description="请检查网络后重试"
              action={
                <Button
                  size="small"
                  onClick={() => {
                    void Promise.all([refetchDriverSuppliers(), refetchGuideSuppliers()])
                  }}
                >
                  重试
                </Button>
              }
              style={{ marginBottom: 16 }}
            />
          ) : null}

          <Row gutter={16}>
            <Col xs={24} md={16}>
              <Form.Item
                name="name"
                label="团名"
                rules={[{ required: true, message: '请输入团名' }]}
              >
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
                <DatePicker className={styles.fullWidth} onChange={handleStartDateChange} />
              </Form.Item>
            </Col>

            <Col xs={24} md={10}>
              <Form.Item
                name="endDate"
                label="结束日期"
                rules={[{ required: true, message: '请选择结束日期' }]}
                getValueProps={(value: string | undefined) => ({ value: toDayjs(value) })}
              >
                <DatePicker className={styles.fullWidth} onChange={handleEndDateChange} />
              </Form.Item>
            </Col>

            <Col xs={24} md={4}>
              <Form.Item name="dayCount" label="天数">
                <Input disabled />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                name="driverSupplierId"
                label="司机"
                extra="选择执行班组不会自动生成应付"
              >
                <Select
                  allowClear
                  showSearch={{ filterOption: false, onSearch: setDriverSearch }}
                  loading={isDriverSuppliersLoading}
                  placeholder="选择含「用车」类别的供应商"
                  options={driverOptions}
                  notFoundContent="暂无匹配供应商，请先到供应商名录维护「用车」类别"
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item name="guideSupplierId" label="导游">
                <Select
                  allowClear
                  showSearch={{ filterOption: false, onSearch: setGuideSearch }}
                  loading={isGuideSuppliersLoading}
                  placeholder="选择含「导游」类别的供应商"
                  options={guideOptions}
                  notFoundContent="暂无匹配供应商，请先到供应商名录维护「导游」类别"
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item name="vehiclePlate" label="车牌">
                <Input placeholder="可选，自由填写" maxLength={32} />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item name="contactPhone" label="联系电话">
                <Input placeholder="可选" maxLength={32} />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item name="notes" label="备注">
                <Input.TextArea rows={3} placeholder="可选" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Col>

      <Col xs={24} xl={8}>
        <Card size="small" title="本次发团摘要" className={styles.summaryCard}>
          <Space orientation="vertical" size={16} className={styles.summaryContent}>
            <div>
              <Typography.Text type="secondary">所选路线</Typography.Text>
              <Typography.Title level={5} className={styles.routeName}>
                {route.routeName || '-'}
              </Typography.Title>
            </div>

            <Space orientation="vertical" size={12}>
              <Typography.Text>
                <CalendarOutlined className={styles.summaryIcon} />
                默认 {route.defaultDayCount ? `${route.defaultDayCount} 天` : '未设置天数'}
              </Typography.Text>
              {route.mode === 'template' ? (
                <Typography.Text>
                  <FileTextOutlined className={styles.summaryIcon} />
                  路线内容将在创建后带入
                </Typography.Text>
              ) : null}
              {route.mode === 'copy' ? (
                <Typography.Text>
                  <CopyOutlined className={styles.summaryIcon} />
                  复制已有发团的行程与资源
                </Typography.Text>
              ) : null}
            </Space>

            {copySummary ? (
              <div className={styles.copySummary}>
                <Typography.Text type="secondary">{copySummary}</Typography.Text>
              </div>
            ) : null}

            <Typography.Text type="secondary" className={styles.numberHint}>
              团号由系统按创建年月自动分配，创建后不可修改。
            </Typography.Text>
          </Space>
        </Card>
      </Col>
      </Row>
    </div>
  )
}
