export interface PreviewObjectUrl {
  value: string
  revoke: () => void
}

export function createPreviewObjectUrl(file: File): PreviewObjectUrl {
  const value = URL.createObjectURL(file)
  return {
    value,
    revoke: () => URL.revokeObjectURL(value),
  }
}
