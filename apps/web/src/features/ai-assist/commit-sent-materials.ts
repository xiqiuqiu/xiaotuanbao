export function collectSentAttachmentBlobUrls(content: unknown): string[] {
  if (!Array.isArray(content)) {
    return []
  }

  const urls: string[] = []
  for (const part of content) {
    if (!part || typeof part !== 'object') {
      continue
    }
    const source = 'source' in part ? part.source : undefined
    if (!source || typeof source !== 'object') {
      continue
    }
    const value = 'value' in source ? source.value : undefined
    if (typeof value === 'string' && value.startsWith('blob:')) {
      urls.push(value)
    }
  }
  return urls
}

export async function commitPendingMaterials({
  taskId,
  blobUrls,
  pendingFiles,
  committedUrls,
  upload,
}: {
  taskId: string
  blobUrls: string[]
  pendingFiles: Map<string, File>
  committedUrls: Set<string>
  upload: (taskId: string, file: File) => Promise<unknown>
}): Promise<number> {
  let committed = 0
  for (const url of blobUrls) {
    if (committedUrls.has(url)) {
      continue
    }
    const file = pendingFiles.get(url)
    if (!file) {
      continue
    }
    committedUrls.add(url)
    try {
      await upload(taskId, file)
      pendingFiles.delete(url)
      committed += 1
    } catch (error) {
      committedUrls.delete(url)
      throw error
    }
  }
  return committed
}
