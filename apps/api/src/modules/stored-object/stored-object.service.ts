import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { StoredObjectSummary } from '@xiaotuanbao/shared'
import { createHash, randomUUID } from 'node:crypto'
import { PrismaService } from '../../database/prisma/prisma.service'
import { FILE_STORE, type FileStore } from './file-store'
import { STORED_OBJECT_MAX_UPLOAD_MB } from './stored-object.constants'
import {
  buildStoredObjectKey,
  sanitizeContentType,
  sanitizeStoredObjectFilename,
} from './stored-object.helpers'

export interface StoredObjectDownloadPayload {
  buffer: Buffer
  contentType: string
  filename: string
}

@Injectable()
export class StoredObjectService {
  private readonly logger = new Logger(StoredObjectService.name)
  private readonly maxUploadBytes: number

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(FILE_STORE) private readonly fileStore: FileStore,
  ) {
    this.maxUploadBytes = this.configService.getOrThrow<number>('app.storedObjectMaxUploadBytes')
  }

  async upload(
    organizationId: string,
    userId: string,
    file: { originalname: string; mimetype?: string; buffer: Buffer; size: number } | undefined,
  ): Promise<StoredObjectSummary> {
    if (!file) {
      throw new BadRequestException('请上传文件（multipart 字段名 file）')
    }
    if (!file.buffer || file.size <= 0 || file.buffer.byteLength <= 0) {
      throw new BadRequestException('不能上传空文件')
    }
    if (file.size > this.maxUploadBytes || file.buffer.byteLength > this.maxUploadBytes) {
      throw new BadRequestException(`文件过大，最大允许 ${STORED_OBJECT_MAX_UPLOAD_MB}MB`)
    }

    const contentSha256 = createHash('sha256').update(file.buffer).digest('hex')
    const reused = await this.prisma.storedObject.findFirst({
      where: { organizationId, contentSha256 },
      orderBy: { createdAt: 'asc' },
    })
    if (reused) {
      return toSummary(reused)
    }

    const objectKey = buildStoredObjectKey(organizationId, randomUUID())
    const originalFilename = sanitizeStoredObjectFilename(file.originalname || 'file')
    const contentType = sanitizeContentType(file.mimetype)
    const sizeBytes = file.buffer.byteLength

    await this.fileStore.putObject({
      key: objectKey,
      body: file.buffer,
      contentType,
    })

    try {
      const created = await this.prisma.storedObject.create({
        data: {
          organizationId,
          objectKey,
          originalFilename,
          contentType,
          sizeBytes,
          contentSha256,
          createdByUserId: userId,
        },
      })
      return toSummary(created)
    } catch (error) {
      try {
        await this.fileStore.deleteObject(objectKey)
      } catch (cleanupError) {
        this.logger.warn(
          `Failed to cleanup object after metadata insert failure key=${objectKey}`,
          cleanupError instanceof Error ? cleanupError.message : undefined,
        )
      }
      throw error
    }
  }

  async download(organizationId: string, id: string): Promise<StoredObjectDownloadPayload> {
    const record = await this.findInOrgOrThrow(organizationId, id)
    const object = await this.fileStore.getObject(record.objectKey)
    return {
      buffer: object.body,
      contentType: record.contentType || object.contentType || 'application/octet-stream',
      filename: record.originalFilename,
    }
  }

  async delete(organizationId: string, id: string): Promise<void> {
    const record = await this.prisma.storedObject.findFirst({
      where: { id, organizationId },
    })
    if (!record) {
      // Idempotent for missing / cross-org ids: same denial style as other org resources.
      throw new NotFoundException('附件不存在')
    }

    await this.fileStore.deleteObject(record.objectKey)
    await this.prisma.storedObject.delete({ where: { id: record.id } })
  }

  private async findInOrgOrThrow(organizationId: string, id: string) {
    const record = await this.prisma.storedObject.findFirst({
      where: { id, organizationId },
    })
    if (!record) {
      throw new NotFoundException('附件不存在')
    }
    return record
  }
}

function toSummary(record: {
  id: string
  originalFilename: string
  contentType: string
  sizeBytes: number
  createdAt: Date
  createdByUserId: string
}): StoredObjectSummary {
  return {
    id: record.id,
    originalFilename: record.originalFilename,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    createdAt: record.createdAt.toISOString(),
    createdByUserId: record.createdByUserId,
  }
}
