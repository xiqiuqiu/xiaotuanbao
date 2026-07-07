import { Button, Drawer, Form, Space } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { DirectoryProfileStatus, InvoiceAvailable } from '@xiaotuanbao/shared'
import {
  SupplierProfileSections,
  type SupplierFormValues,
} from './SupplierProfileSections'

interface SupplierCreateDrawerProps {
  open: boolean
  loading: boolean
  form: FormInstance<SupplierFormValues>
  onClose: () => void
  onSubmit: (values: SupplierFormValues) => void
}

export function SupplierCreateDrawer({
  open,
  loading,
  form,
  onClose,
  onSubmit,
}: SupplierCreateDrawerProps) {
  const handleFinish = (values: SupplierFormValues) => {
    const payload = { ...values }
    if (payload.invoiceAvailable === InvoiceAvailable.NO) {
      payload.invoiceType = undefined
      payload.taxRate = undefined
    }
    onSubmit(payload)
  }

  return (
    <Drawer
      title="创建供应商"
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
      <Form
        form={form}
        layout="vertical"
        initialValues={{ status: DirectoryProfileStatus.ACTIVE }}
        onFinish={handleFinish}
        onValuesChange={(changed) => {
          if (changed.invoiceAvailable === InvoiceAvailable.NO) {
            form.setFieldsValue({ invoiceType: undefined, taxRate: undefined })
          }
        }}
      >
        <SupplierProfileSections form={form} />
      </Form>
    </Drawer>
  )
}
