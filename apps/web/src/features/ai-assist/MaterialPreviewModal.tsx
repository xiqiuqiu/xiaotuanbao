import { Modal, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { downloadDepartureMaterialPreview } from '@/services/ai-create-task.service'

export function MaterialPreviewModal({
  taskId,
  materialId,
  onClose,
}: {
  taskId: string
  materialId: string | null
  onClose: () => void
}) {
  const [preview, setPreview] = useState<{ url: string; contentType: string } | null>(null)

  useEffect(() => {
    if (!materialId) {
      setPreview(null)
      return
    }
    let objectUrl = ''
    let cancelled = false
    void downloadDepartureMaterialPreview(taskId, materialId)
      .then(({ blob }) => {
        if (cancelled) {
          return
        }
        objectUrl = URL.createObjectURL(blob)
        setPreview({ url: objectUrl, contentType: blob.type })
      })
      .catch(() => {
        if (!cancelled) {
          setPreview(null)
        }
      })
    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [materialId, taskId])

  return (
    <Modal
      title="发团资料预览"
      open={Boolean(materialId)}
      footer={null}
      onCancel={onClose}
      width={720}
      destroyOnHidden
    >
      {preview?.contentType.startsWith('image/') ? (
        <img src={preview.url} alt="发团资料预览" style={{ width: '100%' }} />
      ) : preview ? (
        <iframe title="发团资料预览" src={preview.url} style={{ width: '100%', height: 480, border: 0 }} />
      ) : (
        <Typography.Text type="secondary">正在打开档案…</Typography.Text>
      )}
    </Modal>
  )
}
