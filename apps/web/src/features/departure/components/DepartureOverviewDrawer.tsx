import { useState } from 'react'
import { Alert, App, Button, DatePicker, Drawer, Form, Input, Select, Space } from 'antd'
import type { FormInstance } from 'antd/es/form'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DepartureDetail } from '@/types/api'
import { listEmployeeOptions } from '@/services/employee.service'
import { listSuppliers } from '@/services/supplier.service'
import { updateDeparture } from '@/services/departure.service'
import { DirectoryProfileStatus, ResourceKind } from '@xiaotuanbao/shared'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { DEPARTURE_TYPE_OPTIONS } from '../catalog'
import { computeDayCount } from '../utils/departure-wizard-form'
import {
  buildUpdateDeparturePayload,
  departureToFormValues,
  type DepartureOverviewFormValues,
} from '../utils/departure-overview-form'

interface DepartureOverviewDrawerProps {
  open: boolean
  departure: DepartureDetail
  form: FormInstance<DepartureOverviewFormValues>
  onClose: () => void
  onUpdated: () => void
}

function toDayjs(value?: string): Dayjs | null {
  return value ? dayjs(value) : null
}

export function DepartureOverviewDrawer({
  open,
  departure,
  form,
  onClose,
  onUpdated,
}: DepartureOverviewDrawerProps) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [driverSearch, setDriverSearch] = useState('')
  const [guideSearch, setGuideSearch] = useState('')
  const debouncedDriverSearch = useDebouncedValue(driverSearch.trim())
  const debouncedGuideSearch = useDebouncedValue(guideSearch.trim())
  const { data: employeeOptionsResult } = useQuery({
    queryKey: ['employees', 'options', 'departure-overview'],
    queryFn: () => listEmployeeOptions(),
  })
  const {
    data: driverSuppliersResult,
    isLoading: isDriverSuppliersLoading,
    isError: isDriverSuppliersError,
    refetch: refetchDriverSuppliers,
  } = useQuery({
    queryKey: ['suppliers', 'departure-crew', ResourceKind.TRANSPORT, debouncedDriverSearch],
    queryFn: () =>
      listSuppliers({
        search: debouncedDriverSearch || undefined,
        category: ResourceKind.TRANSPORT,
        status: DirectoryProfileStatus.ACTIVE,
        pageSize: 100,
      }),
    enabled: open,
  })
  const {
    data: guideSuppliersResult,
    isLoading: isGuideSuppliersLoading,
    isError: isGuideSuppliersError,
    refetch: refetchGuideSuppliers,
  } = useQuery({
    queryKey: ['suppliers', 'departure-crew', ResourceKind.GUIDE, debouncedGuideSearch],
    queryFn: () =>
      listSuppliers({
        search: debouncedGuideSearch || undefined,
        category: ResourceKind.GUIDE,
        status: DirectoryProfileStatus.ACTIVE,
        pageSize: 100,
      }),
    enabled: open,
  })

  const saveMutation = useMutation({
    mutationFn: (values: DepartureOverviewFormValues) =>
      updateDeparture(departure.id, buildUpdateDeparturePayload(values)),
    onSuccess: (_data, values) => {
      const datesChanged =
        values.startDate !== departure.startDate || values.endDate !== departure.endDate
      message.success('发团信息已保存')
      if (datesChanged) {
        message.info(
          '出团/回团日期已变更：已有行程段（含资源）不会自动删除。延期请手工「添加一天」；缩期后多余空段请手工删除。',
        )
      }
      void queryClient.invalidateQueries({ queryKey: ['departure', departure.id] })
      void queryClient.invalidateQueries({ queryKey: ['departures'] })
      void queryClient.invalidateQueries({ queryKey: ['segments', departure.id] })
      onUpdated()
      onClose()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存失败')
    },
  })

  const handleStartDateChange = (value: Dayjs | null) => {
    const startDate = value?.format('YYYY-MM-DD')
    if (!startDate) {
      return
    }

    const endDate = form.getFieldValue('endDate') as string | undefined
    form.setFieldsValue({
      startDate,
      dayCount: endDate ? computeDayCount(startDate, endDate) : undefined,
    })
  }

  const handleEndDateChange = (value: Dayjs | null) => {
    const endDate = value?.format('YYYY-MM-DD')
    if (!endDate) {
      return
    }

    const startDate = form.getFieldValue('startDate') as string | undefined
    form.setFieldsValue({
      endDate,
      dayCount: startDate ? computeDayCount(startDate, endDate) : undefined,
    })
  }

  const employeeOptions =
    employeeOptionsResult?.map((employee) => ({
      value: employee.id,
      label: employee.name,
    })) ?? []
  const driverOptions = withCurrentSupplierOption(
    driverSuppliersResult?.items ?? [],
    departure.driverSupplierId,
    departure.driverSupplierName,
  )
  const guideOptions = withCurrentSupplierOption(
    guideSuppliersResult?.items ?? [],
    departure.guideSupplierId,
    departure.guideSupplierName,
  )

  const handleClose = () => {
    form.resetFields()
    onClose()
  }

  return (
    <Drawer
      title="编辑基础信息"
      open={open}
      size="min(520px, 100vw)"
      onClose={handleClose}
      destroyOnHidden
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={handleClose}>取消</Button>
          <Button
            type="primary"
            loading={saveMutation.isPending}
            onClick={() => form.submit()}
          >
            保存
          </Button>
        </Space>
      }
    >
      <Form
        key={`${departure.id}-${departure.updatedAt}`}
        form={form}
        layout="vertical"
        initialValues={departureToFormValues(departure)}
        onFinish={(values) => saveMutation.mutate(values)}
      >
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

        <Form.Item
          name="name"
          label="团名"
          rules={[{ required: true, message: '请输入团名' }]}
        >
          <Input />
        </Form.Item>

        <Form.Item name="departureNo" label="团号">
          <Input readOnly />
        </Form.Item>

        <Form.Item
          name="routeName"
          label="路线名称"
          rules={[{ required: true, message: '请输入路线名称' }]}
        >
          <Input />
        </Form.Item>

        <Form.Item
          name="departureType"
          label="发团类型"
          rules={[{ required: true, message: '请选择发团类型' }]}
        >
          <Select options={[...DEPARTURE_TYPE_OPTIONS]} />
        </Form.Item>

        <Form.Item
          name="startDate"
          label="出团日期"
          rules={[{ required: true, message: '请选择出团日期' }]}
          getValueProps={(value: string | undefined) => ({ value: toDayjs(value) })}
          getValueFromEvent={(value: Dayjs | null) => value?.format('YYYY-MM-DD')}
        >
          <DatePicker style={{ width: '100%' }} onChange={handleStartDateChange} />
        </Form.Item>

        <Form.Item
          name="endDate"
          label="结束日期"
          dependencies={['startDate']}
          rules={[
            { required: true, message: '请选择结束日期' },
            ({ getFieldValue }) => ({
              validator(_, value: string | undefined) {
                const startDate = getFieldValue('startDate') as string | undefined
                if (!startDate || !value || value >= startDate) {
                  return Promise.resolve()
                }
                return Promise.reject(new Error('结束日期不能早于出团日期'))
              },
            }),
          ]}
          getValueProps={(value: string | undefined) => ({ value: toDayjs(value) })}
          getValueFromEvent={(value: Dayjs | null) => value?.format('YYYY-MM-DD')}
        >
          <DatePicker style={{ width: '100%' }} onChange={handleEndDateChange} />
        </Form.Item>

        <Form.Item name="dayCount" label="团期天数">
          <Input readOnly />
        </Form.Item>

        <Form.Item
          name="ownerUserId"
          label="发团负责人"
          rules={[{ required: true, message: '请选择负责人' }]}
        >
          <Select options={employeeOptions} showSearch={{ optionFilterProp: 'label' }} />
        </Form.Item>

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

        <Form.Item name="vehiclePlate" label="车牌">
          <Input placeholder="可选，自由填写" maxLength={32} />
        </Form.Item>

        <Form.Item name="contactPhone" label="联系电话">
          <Input placeholder="可选" maxLength={32} />
        </Form.Item>

        <Form.Item name="notes" label="备注">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Drawer>
  )
}

function withCurrentSupplierOption(
  suppliers: Array<{ id: string; name: string }>,
  currentId: string | null,
  currentName: string | null,
) {
  const options = suppliers.map((supplier) => ({
    value: supplier.id,
    label: supplier.name,
  }))
  if (currentId && currentName && !options.some((option) => option.value === currentId)) {
    options.unshift({ value: currentId, label: currentName })
  }
  return options
}
