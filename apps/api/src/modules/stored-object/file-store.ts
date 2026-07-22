export const FILE_STORE = Symbol('FILE_STORE')

export interface FileStorePutObjectInput {
  key: string
  body: Buffer
  contentType: string
}

export interface FileStoreObject {
  body: Buffer
  contentType?: string
  contentLength?: number
}

export interface FileStoreObjectHead {
  contentType?: string
  contentLength?: number
}

/**
 * Portable S3 subset used by the platform (ADR-0027).
 * Presigned put/get may be added later without changing StoredObject metadata.
 */
export interface FileStore {
  putObject(input: FileStorePutObjectInput): Promise<void>
  getObject(key: string): Promise<FileStoreObject>
  deleteObject(key: string): Promise<void>
  headObject(key: string): Promise<FileStoreObjectHead | null>
}
