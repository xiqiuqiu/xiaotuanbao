import styles from './conversation-materials.module.css'
import { useEffect, useState, type ComponentProps } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Modal, Space } from 'antd'
import { CopilotChatAttachmentRenderer, CopilotChatUserMessage } from '@copilotkit/react-core/v2'
import { listDepartureMaterials, previewDepartureMaterial } from '@/services/ai-create-task.service'
import { AssistMaterialsTrigger } from '@/features/ai-assist/AssistMaterialsTrigger'
import { useAgentConversationStore } from './agent-conversation.store'
import { useAgentConversationRuntimeStore } from './agent-conversation-runtime.store'
import type { DepartureMaterialView } from '@xiaotuanbao/shared'

function useMaterialContext() {
  const conversationId = useAgentConversationStore((state) => state.conversationId)
  const refreshKey = useAgentConversationRuntimeStore((state) =>
    state.conversationId === conversationId ? state.events.at(-1)?.sequence ?? 0 : 0)
  return { conversationId, refreshKey }
}

export function ConversationMaterialsTrigger() {
  const { conversationId, refreshKey } = useMaterialContext()
  return conversationId ? <AssistMaterialsTrigger key={conversationId} conversationId={conversationId} refreshKey={refreshKey} /> : null
}

function SourceAttachment({ conversationId, material }: { conversationId: string; material: DepartureMaterialView }) {
  const [url, setUrl] = useState<string>()
  const [open, setOpen] = useState(false)
  const image = material.contentType.startsWith('image/')
  const preview = useQuery({
    queryKey: ['conversation-source-preview', conversationId, material.id],
    queryFn: () => previewDepartureMaterial(conversationId, material.id),
    enabled: image || open,
    retry: false,
  })
  useEffect(() => {
    if (!preview.data) return
    const next = URL.createObjectURL(preview.data.blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [preview.data])
  if (preview.isError) return <Alert type="error" title={`${material.originalFilename} 加载失败`} action={<Button onClick={() => void preview.refetch()}>重试</Button>} />
  return <>
    {image ? (url ? <CopilotChatAttachmentRenderer type="image" source={{ type: 'url', value: url, mimeType: material.contentType }} filename={material.originalFilename} /> : <span>{material.originalFilename} · 加载中</span>) : <Button onClick={() => setOpen(true)}>{material.originalFilename}</Button>}
    <Modal open={open} title={material.originalFilename} footer={null} onCancel={() => setOpen(false)} width={720}>
      {url ? <object data={url} type={material.contentType} width="100%" height="520"><a href={url} download={material.originalFilename}>下载文件</a></object> : '加载中…'}
    </Modal>
  </>
}

export function ConversationUserMessage(props: ComponentProps<typeof CopilotChatUserMessage>) {
  const { conversationId, refreshKey } = useMaterialContext()
  const query = useQuery({
    queryKey: ['ai-create-materials', conversationId, refreshKey],
    queryFn: () => listDepartureMaterials(conversationId!),
    enabled: Boolean(conversationId),
  })
  const sequence = Number(props.message?.id.replace(/^event-/, ''))
  const materials = query.data?.filter((source) => source.userMessageSequences?.includes(sequence)) ?? []
  return <>
    <CopilotChatUserMessage {...props} />
    {conversationId && materials.length > 0 ? <Space wrap className={styles.attachments} aria-label="消息附件">{materials.map((material) => <SourceAttachment key={`${conversationId}:${material.id}`} conversationId={conversationId} material={material} />)}</Space> : null}
  </>
}
