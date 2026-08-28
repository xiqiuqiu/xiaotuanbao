import { useAttachments } from '@copilotkit/react-core/v2'

export const MATERIAL_ACCEPT = 'image/png,image/jpeg,image/webp,image/tiff,application/pdf'
export const MATERIAL_MAX_BYTES = 20 * 1024 * 1024
export const DEFAULT_TASKLESS_ATTACHMENT_TEXT = '请根据附件回答。'

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('附件读取失败'))
        return
      }
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('附件读取失败'))
    reader.readAsDataURL(file)
  })
}

export function filesFromAttachmentSources(
  ready: Array<{ source?: { value?: unknown }; metadata?: Record<string, unknown> }>,
): File[] {
  return ready.flatMap((item) => {
    const metaFile = item.metadata?.file
    return metaFile instanceof File ? [metaFile] : []
  })
}

/** CopilotKit 附件入口：未 enabled / 未传 onAddFile 时加号按钮会一直禁用。 */
export function useConversationComposerAttachments() {
  return useAttachments({
    config: {
      enabled: true,
      accept: MATERIAL_ACCEPT,
      maxSize: MATERIAL_MAX_BYTES,
      onUpload: async (file) => {
        const value = await readFileAsBase64(file)
        return { type: 'data', value, mimeType: file.type, metadata: { file } }
      },
    },
  })
}
