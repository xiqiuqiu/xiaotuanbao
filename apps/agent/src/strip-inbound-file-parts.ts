const FILE_PART_TYPES = new Set([
  'binary',
  'file',
  'file_url',
  'image',
  'image_url',
  'input_file',
  'input_image',
])

type AgentMethod = (input: unknown, options?: unknown) => unknown

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isFilePart(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false
  }
  return FILE_PART_TYPES.has(value.type.toLowerCase())
}

function pointerFromUnknown(value: unknown): string | null {
  if (!isRecord(value)) {
    return null
  }
  const metadata = isRecord(value.metadata) ? value.metadata : undefined
  const materialId =
    (typeof metadata?.materialId === 'string' && metadata.materialId) ||
    (typeof value.materialId === 'string' && value.materialId) ||
    ''
  const filename =
    (typeof metadata?.filename === 'string' && metadata.filename) ||
    (typeof value.filename === 'string' && value.filename) ||
    (typeof value.name === 'string' && value.name) ||
    ''
  if (materialId) {
    return filename
      ? `[发团资料档案] materialId=${materialId} filename=${filename}`
      : `[发团资料档案] materialId=${materialId}`
  }
  if (filename) {
    return `[发团资料档案] filename=${filename}`
  }
  return '[发团资料档案] 已收到附件'
}

function collectAttachmentPointers(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const pointer = pointerFromUnknown(value)
    return pointer ? [pointer] : []
  }
  return value
    .map((item) => pointerFromUnknown(item))
    .filter((item): item is string => Boolean(item))
}

export function stripInboundFileParts<T>(input: T): T {
  return rewrite(input) as T
}

function rewrite(value: unknown): unknown {
  if (Array.isArray(value)) {
    const next: unknown[] = []
    for (const item of value) {
      if (isFilePart(item)) {
        next.push({ type: 'text', text: pointerFromUnknown(item) ?? '[发团资料档案] 已收到附件' })
        continue
      }
      next.push(rewrite(item))
    }
    return next
  }

  if (!isRecord(value)) {
    return value
  }

  const rest = { ...value }
  const attachmentBag = rest.experimental_attachments ?? rest.attachments
  delete rest.experimental_attachments
  delete rest.attachments
  const pointers = collectAttachmentPointers(attachmentBag)
  const rewritten = Object.fromEntries(
    Object.entries(rest).map(([key, entry]) => [key, rewrite(entry)]),
  )

  if (pointers.length === 0) {
    return rewritten
  }

  if (typeof rewritten.content === 'string') {
    rewritten.content = `${rewritten.content}\n${pointers.join('\n')}`
    return rewritten
  }
  if (Array.isArray(rewritten.content)) {
    rewritten.content = [
      ...rewritten.content,
      ...pointers.map((text) => ({ type: 'text', text })),
    ]
    return rewritten
  }
  rewritten.content = pointers.join('\n')
  return rewritten
}

export function wrapAgentStreamToStripInboundFiles<T extends object>(agent: T): T {
  const target = agent as T & { stream: AgentMethod; resumeStream?: AgentMethod }
  const originalStream = target.stream.bind(target)
  target.stream = (input, options) => originalStream(stripInboundFileParts(input), options)

  if (typeof target.resumeStream === 'function') {
    const originalResume = target.resumeStream.bind(target)
    target.resumeStream = (input, options) => originalResume(stripInboundFileParts(input), options)
  }

  return agent
}
