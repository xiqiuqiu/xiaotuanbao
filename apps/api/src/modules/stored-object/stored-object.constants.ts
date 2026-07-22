/**
 * Max for xlsx/docx-style attachments (ADR-0027 / #156).
 * Sized for pilot imports such as 《疆游记》总表 (~31MB); keep headroom without opening abuse.
 */
export const STORED_OBJECT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export const STORED_OBJECT_MAX_UPLOAD_MB = STORED_OBJECT_MAX_UPLOAD_BYTES / (1024 * 1024)
