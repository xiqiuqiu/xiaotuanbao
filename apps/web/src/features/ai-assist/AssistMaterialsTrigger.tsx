import { useEffect, useState, type ReactNode } from 'react'
import { FileImageOutlined, FilePdfOutlined, FileTextOutlined } from '@ant-design/icons'
import { Alert, Badge, Button, Empty, Modal, Popover, Space, Spin, Tag, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import type { DepartureMaterialView } from '@xiaotuanbao/shared'
import { listDepartureMaterials, previewDepartureMaterial } from '@/services/ai-create-task.service'
import { materialsRefetchInterval } from './ai-create-assist-polling'
import styles from './AssistMaterialsTrigger.module.css'

function materialStatusLabel(status: DepartureMaterialView['status']): string {
  if (status === 'available') return '已解析'
  if (status === 'partially_available') return '部分可解析'
  if (status === 'parsing') return '解析中'
  if (status === 'queued' || status === 'uploaded') return '排队中'
  if (status === 'failed') return '解析失败'
  return '处理中'
}

function materialStatusColor(
  status: DepartureMaterialView['status'],
): 'success' | 'warning' | 'processing' | 'error' | 'default' {
  if (status === 'available') return 'success'
  if (status === 'partially_available') return 'warning'
  if (status === 'parsing') return 'processing'
  if (status === 'failed') return 'error'
  return 'default'
}

function materialIcon(contentType: string) {
  if (contentType.startsWith('image/')) return <FileImageOutlined className={styles.icon} />
  if (contentType === 'application/pdf') return <FilePdfOutlined className={styles.icon} />
  return <FileTextOutlined className={styles.icon} />
}

export function AssistMaterialsTrigger({
  conversationId,
  refreshKey = 0,
}: {
  conversationId: string
  refreshKey?: number
}) {
  const [preview, setPreview] = useState<{
    filename: string
    contentType: string
    url: string
  } | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const query = useQuery({
    queryKey: ['ai-create-materials', conversationId, refreshKey],
    queryFn: () => listDepartureMaterials(conversationId),
    enabled: Boolean(conversationId),
    refetchInterval: (current) => materialsRefetchInterval(current.state.data),
    refetchIntervalInBackground: false,
  })
  const materials = query.data ?? []

  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview.url)
      }
    }
  }, [preview])

  const openPreview = (material: DepartureMaterialView) => {
    setPreviewError(null)
    void previewDepartureMaterial(conversationId, material.id)
      .then(({ blob, filename }) => {
        setPreview({
          filename: filename || material.originalFilename,
          contentType: material.contentType,
          url: URL.createObjectURL(blob),
        })
      })
      .catch(() => {
        setPreviewError('发团资料预览失败，请稍后重试')
      })
  }

  let body: ReactNode
  if (query.isError && !query.data) {
    body = (
      <Alert
        type="error"
        showIcon
        title="发团资料加载失败"
        action={
          <Button size="small" aria-label="重试" onClick={() => void query.refetch()}>
            重试
          </Button>
        }
      />
    )
  } else if (query.isPending) {
    body = (
      <div className={styles.loading}>
        <Spin />
      </div>
    )
  } else if (materials.length === 0) {
    body = (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="在对话中附上图片或 PDF 后发送，资料会出现在这里"
      />
    )
  } else {
    body = (
      <Space orientation="vertical" size={4} className={styles.list}>
        {previewError ? <Alert type="error" showIcon title={previewError} /> : null}
        {query.isError ? (
          <Alert
            type="error"
            showIcon
            title="发团资料刷新失败"
            action={
              <Button size="small" aria-label="重试" onClick={() => void query.refetch()}>
                重试
              </Button>
            }
          />
        ) : null}
        {materials.map((material) => (
          <div key={material.id} className={styles.row}>
            {materialIcon(material.contentType)}
            <Typography.Text className={styles.filename} ellipsis={{ tooltip: material.originalFilename }}>
              {material.originalFilename}
            </Typography.Text>
            <Tag className={styles.status} variant="filled" color={materialStatusColor(material.status)}>
              {materialStatusLabel(material.status)}
            </Tag>
            <Button className={styles.preview} type="link" onClick={() => openPreview(material)}>
              预览
            </Button>
          </div>
        ))}
      </Space>
    )
  }

  return (
    <>
      <Popover
        trigger="click"
        placement="bottomRight"
        title="发团资料"
        content={<div className={styles.panel}>{body}</div>}
      >
        <Badge size="small" count={materials.length}>
          <Button type="text" icon={<FileTextOutlined />} aria-label="发团资料" />
        </Badge>
      </Popover>
      <Modal
        title={preview?.filename}
        open={Boolean(preview)}
        footer={null}
        onCancel={() => setPreview(null)}
        width={720}
      >
        {preview?.contentType.startsWith('image/') ? (
          <img src={preview.url} alt={preview.filename} className={styles.previewImage} />
        ) : preview ? (
          <object data={preview.url} type={preview.contentType} className={styles.previewFrame}>
            无法预览该文件
          </object>
        ) : null}
      </Modal>
    </>
  )
}
