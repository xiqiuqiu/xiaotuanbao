import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type {
  FileStore,
  FileStoreObject,
  FileStoreObjectHead,
  FileStorePutObjectInput,
} from './file-store'

@Injectable()
export class S3FileStore implements FileStore {
  private readonly logger = new Logger(S3FileStore.name)
  private readonly client: S3Client
  private readonly bucket: string

  constructor(configService: ConfigService) {
    const s3 = configService.getOrThrow<{
      endpoint: string
      region: string
      bucket: string
      accessKey: string
      secretKey: string
    }>('app.s3')

    this.bucket = s3.bucket
    this.client = new S3Client({
      endpoint: s3.endpoint,
      region: s3.region,
      credentials: {
        accessKeyId: s3.accessKey,
        secretAccessKey: s3.secretKey,
      },
      forcePathStyle: true,
    })
  }

  async putObject(input: FileStorePutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ContentLength: input.body.byteLength,
      }),
    )
  }

  async getObject(key: string): Promise<FileStoreObject> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      )
      const body = await streamToBuffer(result.Body)
      return {
        body,
        contentType: result.ContentType,
        contentLength: result.ContentLength,
      }
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new NotFoundException('附件不存在')
      }
      this.logger.error(`getObject failed for key=${key}`, error instanceof Error ? error.stack : undefined)
      throw error
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    )
  }

  async headObject(key: string): Promise<FileStoreObjectHead | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      )
      return {
        contentType: result.ContentType,
        contentLength: result.ContentLength,
      }
    } catch (error) {
      if (isNotFoundError(error)) {
        return null
      }
      throw error
    }
  }
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    return Buffer.alloc(0)
  }
  if (Buffer.isBuffer(body)) {
    return body
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body)
  }
  if (typeof body === 'string') {
    return Buffer.from(body)
  }
  if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === 'function') {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray()
    return Buffer.from(bytes)
  }

  const chunks: Buffer[] = []
  for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const name = 'name' in error ? String(error.name) : ''
  const code = 'Code' in error ? String((error as { Code?: string }).Code) : ''
  const httpStatus =
    '$metadata' in error &&
    typeof (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 'number'
      ? (error as { $metadata: { httpStatusCode: number } }).$metadata.httpStatusCode
      : undefined
  return (
    name === 'NoSuchKey' ||
    name === 'NotFound' ||
    code === 'NoSuchKey' ||
    code === 'NotFound' ||
    httpStatus === 404
  )
}
