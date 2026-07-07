import { useState } from 'react'
import { Button, Card, Form, Spin, Tabs, Typography, message } from 'antd'
import { EditOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { getPartner, updatePartner } from '@/services/partner.service'
import { SupplierComingSoonPanel } from '@/features/supplier/components/SupplierComingSoonPanel'
import { PartnerFormDrawer } from '../components/PartnerFormDrawer'
import type { PartnerFormValues } from '../components/PartnerProfileSections'
import { PartnerReadonlySections } from '../components/PartnerReadonlySections'
import { buildUpdatePayload, partnerToFormValues } from '../utils/partner-form'

export function PartnerDetailPage() {
  const { partnerId } = useParams({ strict: false })
  const queryClient = useQueryClient()
  const [form] = Form.useForm<PartnerFormValues>()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { data: partner, isLoading, isError } = useQuery({
    queryKey: ['partner', partnerId],
    queryFn: () => getPartner(partnerId!),
    enabled: Boolean(partnerId),
  })

  const closeDrawer = () => {
    setDrawerOpen(false)
    form.resetFields()
  }

  const openEditDrawer = () => {
    if (!partner) {
      return
    }
    form.setFieldsValue(partnerToFormValues(partner))
    setDrawerOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async (values: PartnerFormValues) => {
      return updatePartner(partnerId!, buildUpdatePayload(values))
    },
    onSuccess: () => {
      message.success('合作伙伴已更新')
      closeDrawer()
      queryClient.invalidateQueries({ queryKey: ['partner', partnerId] })
      queryClient.invalidateQueries({ queryKey: ['partners'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存失败')
    },
  })

  if (!partnerId) {
    return (
      <div>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          合作伙伴不存在
        </Typography.Title>
        <Link to="/partner">返回合作伙伴列表</Link>
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

  if (isError || !partner) {
    return (
      <div>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          合作伙伴不存在
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          该合作伙伴可能已被删除或您无权访问。
        </Typography.Paragraph>
        <Link to="/partner">返回合作伙伴列表</Link>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 0 }}>
          {partner.name}
        </Typography.Title>
        <Button type="primary" icon={<EditOutlined />} onClick={openEditDrawer}>
          编辑
        </Button>
      </div>

      <Card>
        <Tabs
          items={[
            {
              key: 'profile',
              label: '基本信息',
              children: <PartnerReadonlySections partner={partner} />,
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

      <PartnerFormDrawer
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
