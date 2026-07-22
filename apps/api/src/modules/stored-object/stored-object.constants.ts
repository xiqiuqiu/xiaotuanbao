/** Conservative max for xlsx/docx-style attachments (ADR-0027 / #156). */
export const STORED_OBJECT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export const STORED_OBJECT_MAX_UPLOAD_MB = STORED_OBJECT_MAX_UPLOAD_BYTES / (1024 * 1024)
