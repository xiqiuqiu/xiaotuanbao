/** Excel / download illegal filename characters + control chars. */
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g

/**
 * Multer/busboy often surfaces UTF-8 filenames as latin1 mojibake.
 * Re-decode when the round-trip yields different (valid) UTF-8.
 */
export function decodeMultipartFilename(filename: string): string {
  const redecoded = Buffer.from(filename, 'latin1').toString('utf8')
  if (redecoded === filename) {
    return filename
  }
  // Prefer redecoded form when it looks like recoverable UTF-8 text.
  if (!redecoded.includes('\uFFFD')) {
    return redecoded
  }
  return filename
}

export function sanitizeStoredObjectFilename(filename: string): string {
  const decoded = decodeMultipartFilename(filename)
  const base = decoded.split(/[/\\]/).pop()?.trim() || ''
  const cleaned = base.replace(ILLEGAL_FILENAME_CHARS, '_').replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned.slice(0, 255) : 'file'
}

export function buildStoredObjectContentDisposition(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"')
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

/** Organization-scoped, unguessable object key (UUID segment). */
export function buildStoredObjectKey(organizationId: string, unguessableId: string): string {
  return `orgs/${organizationId}/${unguessableId}`
}

export function sanitizeContentType(raw: string | undefined): string {
  const value = (raw ?? '').trim()
  if (!value || value.length > 200 || /[\r\n]/.test(value)) {
    return 'application/octet-stream'
  }
  return value
}
