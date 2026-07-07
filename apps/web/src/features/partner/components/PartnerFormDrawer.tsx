import { Button, Drawer, Form, Space } from 'antd'
import type { FormInstance } from 'antd/es/form'
import {
  PartnerProfileSections,
  type PartnerFormValues,
} from './PartnerProfileSections'

interface PartnerFormDrawerProps {
  open: boolean
  editing: boolean
  loading: boolean
  form: FormInstance<PartnerFormValues>
  onClose: () => void
  onSubmit: (values: PartnerFormValues) => void
}

export function PartnerFormDrawer({
  open,
  editing,
  loading,
  form,
  onClose,
  onSubmit,
}: PartnerFormDrawerProps) {
  return (
    <Drawer
      title={editing ? '编辑合作伙伴' : '创建合作伙伴'}
      open={open}
      width={520}
      onClose={onClose}
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={loading} onClick={() => form.submit()}>
            保存
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <PartnerProfileSections showStatus={editing} />
      </Form>
    </Drawer>
  )
}
