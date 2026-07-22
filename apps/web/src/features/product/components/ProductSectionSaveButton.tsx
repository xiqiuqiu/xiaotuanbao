import { Button } from 'antd'

export function ProductSectionSaveButton({
  canEdit,
  loading,
  onSave,
}: {
  canEdit: boolean
  loading: boolean
  onSave: () => void
}) {
  if (!canEdit) {
    return null
  }
  return (
    <Button loading={loading} onClick={onSave}>
      保存
    </Button>
  )
}
