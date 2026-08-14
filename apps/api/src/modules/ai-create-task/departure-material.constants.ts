export const MATERIAL_ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  'application/pdf',
])

export const MATERIAL_MAX_BYTES = 20 * 1024 * 1024
export const MATERIAL_MAX_FILES_PER_SEND = 8

export const PARSE_FAILED_ERROR_CODE = 'PARSE_FAILED'
export const PARSE_FAILED_ERROR_MESSAGE = '无法从该资料提取可用文字'

export function parseErrorMessage(code: string | null | undefined): string {
  if (code === PARSE_FAILED_ERROR_CODE) {
    return PARSE_FAILED_ERROR_MESSAGE
  }
  return '资料解析失败'
}

export function agentBatchJobKey(inputBatchId: string): string {
  return `agent_batch:${inputBatchId}`
}

export function materialParseJobKey(materialId: string): string {
  return `material_parse:${materialId}`
}

export function materialProgressFromDeps(
  deps: Array<{
    required: boolean
    parseResultVersion: number | null
    failed?: boolean
  }>,
): { ready: number; total: number; failed: number } {
  const required = deps.filter((item) => item.required)
  return {
    ready: required.filter((item) => item.parseResultVersion != null).length,
    total: required.length,
    failed: required.filter((item) => item.parseResultVersion == null && item.failed).length,
  }
}
