import { useState } from 'react'
import { Button, Card, Form, Spin, Tabs, Typography, message } from 'antd'
import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useAuthStore } from '@/app/store/auth.store'
import { getSupplier, updateSupplier } from '@/services/supplier.service'
import { canEditSupplier } from '../utils/supplier-permission'
import { SupplierComingSoonPanel } from '../components/SupplierComingSoonPanel'
import { SupplierFormDrawer } from '../components/SupplierFormDrawer'
import type { SupplierFormValues } from '../components/SupplierProfileSections'
import { SupplierReadonlySections } from '../components/SupplierReadonlySections'
import {
  buildUpdatePayload,
  clearInvoiceFieldsWhenUnavailable,
  toFormValues,
} from '../utils/supplier-form'

export function SupplierDetailPage() {
  const { supplierId } = useParams({ strict: false })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<SupplierFormValues>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const canEdit = canEditSupplier(useAuthStore((state) => state.actionKeys))
  const goBack = () => void navigate({ to: '/supplier' })

  const { data: supplier, isLoading, isError } = useQuery({
    queryKey: ['supplier', supplierId],
    queryFn: () => getSupplier(supplierId!),
    enabled: Boolean(supplierId),
  })

  const closeDrawer = () => {
    setDrawerOpen(false)
    form.resetFields()
  }

  const openEditDrawer = () => {
    if (!supplier) {
      return
    }
    form.setFieldsValue(toFormValues(supplier))
    setDrawerOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async (values: SupplierFormValues) => {
      const payload = clearInvoiceFieldsWhenUnavailable(buildUpdatePayload(values))
      return updateSupplier(supplierId!, payload)
    },
    onSuccess: () => {
      message.success('供应商已更新')
      closeDrawer()
      queryClient.invalidateQueries({ queryKey: ['supplier', supplierId] })
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存失败')
    },
  })

  if (!supplierId) {
    return (
      <div>
        <Button type="text" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0, marginBottom: 16 }} onClick={goBack}>
          返回供应商列表
        </Button>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          供应商不存在
        </Typography.Title>
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

  if (isError || !supplier) {
    return (
      <div>
        <Button type="text" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0, marginBottom: 16 }} onClick={goBack}>
          返回供应商列表
        </Button>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          供应商不存在
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          该供应商可能已被删除或您无权访问。
        </Typography.Paragraph>
      </div>
    )
  }

  return (
    <div>
      <Button type="text" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0, marginBottom: 16 }} onClick={goBack}>
        返回供应商列表
      </Button>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div>
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 0 }}>
            {supplier.name}
          </Typography.Title>
        </div>
        {canEdit ? (
          <Button type="primary" icon={<EditOutlined />} onClick={openEditDrawer}>
            编辑
          </Button>
        ) : null}
      </div>

      <Card>
        <Tabs
          items={[
            {
              key: 'profile',
              label: '基本信息',
              children: <SupplierReadonlySections supplier={supplier} />,
            },
            {
              key: 'accounts',
              label: '往来账款',
              children: <SupplierComingSoonPanel />,
            },
            {
              key: 'groups',
              label: '合作团单',
              children: <SupplierComingSoonPanel />,
            },
          ]}
        />
      </Card>

      <SupplierFormDrawer
        open={drawerOpen}
        editing
        loading={saveMutation.isPending}
        form={form}
        onClose={closeDrawer}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
    </div>
  )
}
