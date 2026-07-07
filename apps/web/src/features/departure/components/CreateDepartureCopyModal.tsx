import { Checkbox, Modal, Space, Tooltip } from 'antd'

export interface TemplateCopyModalState {
  copySegments: boolean
  copyResources: boolean
  copyReferencePrices: boolean
}

interface CreateDepartureCopyModalProps {
  open: boolean
  mode: 'template' | 'departure'
  values: TemplateCopyModalState
  title: string
  okText: string
  confirmLoading: boolean
  onCancel: () => void
  onConfirm: () => void
  onChange: (values: TemplateCopyModalState) => void
}

export function CreateDepartureCopyModal({
  open,
  mode,
  values,
  title,
  okText,
  confirmLoading,
  onCancel,
  onConfirm,
  onChange,
}: CreateDepartureCopyModalProps) {
  return (
    <Modal
      title={title}
      open={open}
      okText={okText}
      cancelText="取消"
      confirmLoading={confirmLoading}
      onCancel={onCancel}
      onOk={onConfirm}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Checkbox
          checked={values.copySegments}
          onChange={(event) =>
            onChange({
              ...values,
              copySegments: event.target.checked,
            })
          }
        >
          复制行程段
        </Checkbox>
        <Checkbox
          checked={values.copyResources}
          onChange={(event) =>
            onChange({
              ...values,
              copyResources: event.target.checked,
            })
          }
        >
          复制资源配置
        </Checkbox>
        <Checkbox
          checked={values.copyReferencePrices}
          onChange={(event) =>
            onChange({
              ...values,
              copyReferencePrices: event.target.checked,
            })
          }
        >
          带出参考价格
        </Checkbox>
        <Tooltip
          title={
            mode === 'departure'
              ? '客源每次不同，不能从发团复制'
              : '客源每次不同，不能从模板复制'
          }
        >
          <Checkbox disabled checked={false}>
            复制客源
          </Checkbox>
        </Tooltip>
        <Tooltip
          title={
            mode === 'departure'
              ? '收付款节点不能从发团复制'
              : '收付款节点不能从模板复制'
          }
        >
          <Checkbox disabled checked={false}>
            生成应收应付
          </Checkbox>
        </Tooltip>
      </Space>
    </Modal>
  )
}
