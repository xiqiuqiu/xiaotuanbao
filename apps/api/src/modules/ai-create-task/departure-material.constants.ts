export const MATERIAL_ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  'application/pdf',
])

export const MATERIAL_MAX_BYTES = 20 * 1024 * 1024
export const MATERIAL_MAX_FILES_PER_SEND = 8

export function agentBatchJobKey(inputBatchId: string): string {
  return `agent_batch:${inputBatchId}`
}

export function materialParseJobKey(materialId: string): string {
  return `material_parse:${materialId}`
}

export function materialProgressFromDeps(
  deps: Array<{ required: boolean; parseResultVersion: number | null }>,
): { ready: number; total: number } {
  const required = deps.filter((item) => item.required)
  return {
    ready: required.filter((item) => item.parseResultVersion != null).length,
    total: required.length,
  }
}
