import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import {
  AiInputBatchStatus,
  AiWorkflowJobStatus,
  AiWorkflowJobType,
  DepartureMaterialParseRunStatus,
  DepartureMaterialStatus,
  type DepartureMaterial,
  type Prisma,
} from '@prisma/client'
import type { DepartureMaterialView, StoredObjectSummary } from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'
import { StoredObjectService } from '../stored-object/stored-object.service'
import {
  MATERIAL_ALLOWED_CONTENT_TYPES,
  MATERIAL_MAX_BYTES,
  MATERIAL_MAX_FILES_PER_SEND,
  PARSE_FAILED_ERROR_CODE,
  materialParseJobKey,
} from './departure-material.constants'
import { ParseWorkerClient } from './parse-worker.client'

const CONSUMABLE: DepartureMaterialStatus[] = [
  DepartureMaterialStatus.available,
  DepartureMaterialStatus.partially_available,
]

export type IncomingMaterialFile = {
  originalname: string
  mimetype?: string
  buffer: Buffer
  size: number
}

export type ArchivedMaterial = {
  material: DepartureMaterial
  parseResultVersion: number | null
  needsParseJob: boolean
  consumedStoredObjectId: string | null
}

export type PreparedMaterialUploads = {
  storedByFileKey: Map<string, StoredObjectSummary>
  uploadedIds: string[]
}

export function materialFileKey(file: IncomingMaterialFile): string {
  const contentType = (file.mimetype ?? '').toLowerCase()
  return `${createHash('sha256').update(file.buffer).digest('hex')}:${file.buffer.byteLength}:${contentType}`
}

@Injectable()
export class DepartureMaterialService {
  private readonly logger = new Logger(DepartureMaterialService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly storedObjectService: StoredObjectService,
    private readonly parseWorkerClient: ParseWorkerClient,
  ) {}

  validateIncomingFiles(files: IncomingMaterialFile[]): IncomingMaterialFile[] {
    if (files.length > MATERIAL_MAX_FILES_PER_SEND) {
      throw new BadRequestException(`一次最多发送 ${MATERIAL_MAX_FILES_PER_SEND} 个附件`)
    }
    return files.map((file) => {
      const contentType = (file.mimetype ?? '').toLowerCase()
      if (!MATERIAL_ALLOWED_CONTENT_TYPES.has(contentType)) {
        throw new BadRequestException('仅支持 PNG、JPEG、WebP、TIFF 和 PDF')
      }
      if (!file.buffer || file.size <= 0 || file.buffer.byteLength <= 0) {
        throw new BadRequestException('不能上传空文件')
      }
      if (file.size > MATERIAL_MAX_BYTES || file.buffer.byteLength > MATERIAL_MAX_BYTES) {
        throw new BadRequestException('文件不能超过 20MB')
      }
      return { ...file, mimetype: contentType }
    })
  }

  sha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex')
  }

  async prepareUploads(params: {
    organizationId: string
    userId: string
    taskId: string
    files: IncomingMaterialFile[]
  }): Promise<PreparedMaterialUploads> {
    const storedByFileKey = new Map<string, StoredObjectSummary>()
    const uploadedIds: string[] = []
    try {
      for (const file of params.files) {
        const contentType = (file.mimetype ?? '').toLowerCase()
        const existing = await this.prisma.departureMaterial.findUnique({
          where: {
            taskId_sha256_sizeBytes_contentType: {
              taskId: params.taskId,
              sha256: this.sha256(file.buffer),
              sizeBytes: file.buffer.byteLength,
              contentType,
            },
          },
          select: { id: true },
        })
        if (existing) {
          continue
        }
        const stored = await this.storedObjectService.upload(
          params.organizationId,
          params.userId,
          file,
        )
        storedByFileKey.set(materialFileKey(file), stored)
        uploadedIds.push(stored.id)
      }
      return { storedByFileKey, uploadedIds }
    } catch (error) {
      await this.discardStoredObjects(params.organizationId, uploadedIds)
      throw error
    }
  }

  async discardStoredObjects(organizationId: string, ids: string[]): Promise<void> {
    for (const id of ids) {
      try {
        await this.storedObjectService.delete(organizationId, id)
      } catch (error) {
        this.logger.warn(
          `Failed to cleanup stored object after conversation archive id=${id}`,
          error instanceof Error ? error.message : undefined,
        )
      }
    }
  }

  async archiveForTask(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string
      userId: string
      taskId: string
      file: IncomingMaterialFile
      stored?: StoredObjectSummary
    },
  ): Promise<ArchivedMaterial> {
    const contentType = (params.file.mimetype ?? '').toLowerCase()
    const sha256 = this.sha256(params.file.buffer)
    const existing = await tx.departureMaterial.findUnique({
      where: {
        taskId_sha256_sizeBytes_contentType: {
          taskId: params.taskId,
          sha256,
          sizeBytes: params.file.buffer.byteLength,
          contentType,
        },
      },
      include: {
        parseRuns: {
          where: { status: DepartureMaterialParseRunStatus.succeeded },
          orderBy: { resultVersion: 'desc' },
          take: 1,
        },
      },
    })
    if (existing) {
      return reusedMaterial(existing)
    }

    const stored = params.stored
    if (!stored) {
      throw new ConflictException('资料归档冲突，请重试')
    }

    try {
      const material = await tx.departureMaterial.create({
        data: {
          organizationId: params.organizationId,
          taskId: params.taskId,
          storedObjectId: stored.id,
          originalFilename: stored.originalFilename,
          contentType,
          sizeBytes: params.file.buffer.byteLength,
          sha256,
          status: DepartureMaterialStatus.queued,
          createdByUserId: params.userId,
        },
      })
      await tx.departureMaterialParseRun.create({
        data: {
          organizationId: params.organizationId,
          materialId: material.id,
          status: DepartureMaterialParseRunStatus.queued,
          resultVersion: 1,
          parserVersions: {},
        },
      })
      return {
        material,
        parseResultVersion: null,
        needsParseJob: true,
        consumedStoredObjectId: stored.id,
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await tx.departureMaterial.findUniqueOrThrow({
          where: {
            taskId_sha256_sizeBytes_contentType: {
              taskId: params.taskId,
              sha256,
              sizeBytes: params.file.buffer.byteLength,
              contentType,
            },
          },
          include: {
            parseRuns: {
              where: { status: DepartureMaterialParseRunStatus.succeeded },
              orderBy: { resultVersion: 'desc' },
              take: 1,
            },
          },
        })
        return reusedMaterial(raced)
      }
      throw error
    }
  }

  async enqueueParseJob(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string
      taskId: string
      conversationId: string
      inputBatchId: string
      materialId: string
    },
  ): Promise<void> {
    const jobKey = materialParseJobKey(params.materialId)
    await tx.aiWorkflowJob.upsert({
      where: { jobKey },
      create: {
        organizationId: params.organizationId,
        taskId: params.taskId,
        conversationId: params.conversationId,
        inputBatchId: params.inputBatchId,
        materialId: params.materialId,
        type: AiWorkflowJobType.material_parse,
        jobKey,
        status: AiWorkflowJobStatus.pending,
      },
      update: {},
    })
    await tx.aiWorkflowJob.updateMany({
      where: {
        jobKey,
        status: {
          in: [AiWorkflowJobStatus.failed, AiWorkflowJobStatus.succeeded],
        },
      },
      data: {
        conversationId: params.conversationId,
        inputBatchId: params.inputBatchId,
        status: AiWorkflowJobStatus.pending,
        attemptCount: 0,
        claimedAt: null,
        claimedBy: null,
        leaseExpiresAt: null,
        nextAttemptAt: new Date(),
        lastErrorCode: null,
      },
    })
  }

  async list(organizationId: string, userId: string, taskId: string): Promise<DepartureMaterialView[]> {
    await this.assertOwnedTask(organizationId, userId, taskId)
    const materials = await this.prisma.departureMaterial.findMany({
      where: { organizationId, taskId },
      orderBy: { createdAt: 'asc' },
      include: {
        parseRuns: { orderBy: { resultVersion: 'desc' }, take: 1 },
      },
    })
    return materials.map((material) =>
      toMaterialView(
        material,
        material.parseRuns[0]?.status === DepartureMaterialParseRunStatus.succeeded
          ? material.parseRuns[0].resultVersion
          : null,
      ),
    )
  }

  async preview(organizationId: string, userId: string, taskId: string, materialId: string) {
    await this.assertOwnedTask(organizationId, userId, taskId)
    const material = await this.prisma.departureMaterial.findFirst({
      where: { id: materialId, organizationId, taskId },
    })
    if (!material) {
      throw new NotFoundException('发团资料档案不存在')
    }
    return this.storedObjectService.download(organizationId, material.storedObjectId)
  }

  async getPinnedParseResult(params: {
    organizationId: string
    taskId: string
    inputBatchId: string
    materialId: string
    parseResultVersion: number
  }) {
    const dependency = await this.prisma.aiInputBatchMaterial.findFirst({
      where: {
        organizationId: params.organizationId,
        inputBatchId: params.inputBatchId,
        materialId: params.materialId,
        parseResultVersion: params.parseResultVersion,
      },
    })
    if (!dependency) {
      throw new NotFoundException('该批次未固定此解析版本')
    }
    const run = await this.prisma.departureMaterialParseRun.findFirst({
      where: {
        materialId: params.materialId,
        resultVersion: params.parseResultVersion,
        status: DepartureMaterialParseRunStatus.succeeded,
      },
    })
    if (!run) {
      throw new NotFoundException('发团资料解析结果不存在')
    }
    const pages = Array.isArray(run.pages) ? run.pages : []
    return {
      materialId: params.materialId,
      parseResultVersion: run.resultVersion,
      pages: pages.map((page) => {
        const record = page as Record<string, unknown>
        return {
          pageNumber: Number(record.pageNumber),
          source: record.source === 'native_pdf' ? ('native_pdf' as const) : ('ocr' as const),
          text: String(record.text ?? ''),
        }
      }),
    }
  }

  async executeParseJob(job: {
    id: string
    organizationId: string
    materialId: string | null
  }): Promise<{ materialId: string; parseResultVersion: number } | null> {
    if (!job.materialId) {
      return null
    }
    const material = await this.prisma.departureMaterial.findFirst({
      where: { id: job.materialId, organizationId: job.organizationId },
      include: {
        parseRuns: { orderBy: { resultVersion: 'desc' }, take: 1 },
      },
    })
    if (!material) {
      return null
    }
    const run = material.parseRuns[0]
    if (!run || run.status === DepartureMaterialParseRunStatus.failed) {
      return null
    }
    if (
      run.status === DepartureMaterialParseRunStatus.succeeded &&
      CONSUMABLE.includes(material.status)
    ) {
      await this.finishParseJob(job.id)
      return { materialId: material.id, parseResultVersion: run.resultVersion }
    }

    await this.prisma.departureMaterial.update({
      where: { id: material.id },
      data: { status: DepartureMaterialStatus.parsing, statusVersion: { increment: 1 } },
    })
    await this.prisma.departureMaterialParseRun.update({
      where: { id: run.id },
      data: { status: DepartureMaterialParseRunStatus.running, startedAt: new Date() },
    })

    const stored = await this.storedObjectService.download(job.organizationId, material.storedObjectId)
    const parsed = await this.parseWorkerClient.parse({
      buffer: stored.buffer,
      filename: stored.filename,
      contentType: stored.contentType || material.contentType,
    })
    const failedPages = parsed.pages.filter((page) => !page.text.trim()).length
    const status =
      parsed.pages.length > 0 && failedPages > 0 && failedPages < parsed.pages.length
        ? DepartureMaterialStatus.partially_available
        : parsed.pages.some((page) => page.text.trim())
          ? DepartureMaterialStatus.available
          : DepartureMaterialStatus.failed
    const resultVersion = run.resultVersion
    await this.prisma.$transaction(async (tx) => {
      await tx.departureMaterialParseRun.update({
        where: { id: run.id },
        data: {
          status:
            status === DepartureMaterialStatus.failed
              ? DepartureMaterialParseRunStatus.failed
              : DepartureMaterialParseRunStatus.succeeded,
          pages: parsed.pages as unknown as Prisma.InputJsonValue,
          parserVersions: parsed.parserVersions as Prisma.InputJsonValue,
          errorCode: status === DepartureMaterialStatus.failed ? PARSE_FAILED_ERROR_CODE : null,
          endedAt: new Date(),
        },
      })
      await tx.departureMaterial.update({
        where: { id: material.id },
        data: { status, statusVersion: { increment: 1 } },
      })
      if (CONSUMABLE.includes(status)) {
        await tx.aiWorkflowJob.update({
          where: { id: job.id },
          data: {
            status: AiWorkflowJobStatus.succeeded,
            lastErrorCode: null,
            leaseExpiresAt: null,
          },
        })
      }
    })
    if (CONSUMABLE.includes(status)) {
      return { materialId: material.id, parseResultVersion: resultVersion }
    }
    return null
  }

  async markParseTerminalFailure(materialId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.departureMaterial.updateMany({
        where: {
          id: materialId,
          status: {
            in: [DepartureMaterialStatus.queued, DepartureMaterialStatus.parsing],
          },
        },
        data: { status: DepartureMaterialStatus.failed, statusVersion: { increment: 1 } },
      })
      await tx.departureMaterialParseRun.updateMany({
        where: {
          materialId,
          status: {
            in: [
              DepartureMaterialParseRunStatus.queued,
              DepartureMaterialParseRunStatus.running,
            ],
          },
        },
        data: {
          status: DepartureMaterialParseRunStatus.failed,
          errorCode: PARSE_FAILED_ERROR_CODE,
          endedAt: new Date(),
        },
      })
    })
  }

  async pinMaterialVersion(materialId: string, parseResultVersion: number): Promise<string[]> {
    const waiting = await this.prisma.aiInputBatchMaterial.findMany({
      where: {
        materialId,
        required: true,
        parseResultVersion: null,
        inputBatch: { status: AiInputBatchStatus.waiting_for_materials },
      },
      select: { id: true, inputBatchId: true },
    })
    if (waiting.length === 0) {
      return []
    }
    await this.prisma.aiInputBatchMaterial.updateMany({
      where: { id: { in: waiting.map((item) => item.id) } },
      data: { parseResultVersion },
    })
    return [...new Set(waiting.map((item) => item.inputBatchId))]
  }

  async startNewParseRun(
    tx: Prisma.TransactionClient,
    params: { organizationId: string; materialId: string },
  ): Promise<number> {
    const latest = await tx.departureMaterialParseRun.findFirst({
      where: { materialId: params.materialId },
      orderBy: { resultVersion: 'desc' },
    })
    const resultVersion = (latest?.resultVersion ?? 0) + 1
    await tx.departureMaterialParseRun.create({
      data: {
        organizationId: params.organizationId,
        materialId: params.materialId,
        status: DepartureMaterialParseRunStatus.queued,
        resultVersion,
        parserVersions: {},
      },
    })
    await tx.departureMaterial.update({
      where: { id: params.materialId },
      data: { status: DepartureMaterialStatus.queued, statusVersion: { increment: 1 } },
    })
    return resultVersion
  }

  private async finishParseJob(jobId: string): Promise<void> {
    await this.prisma.aiWorkflowJob.update({
      where: { id: jobId },
      data: { status: AiWorkflowJobStatus.succeeded, leaseExpiresAt: null },
    })
  }

  private async assertOwnedTask(organizationId: string, userId: string, taskId: string) {
    const task = await this.prisma.aiCreateTask.findFirst({
      where: { id: taskId, organizationId, creatorUserId: userId },
    })
    if (!task) {
      throw new NotFoundException('AI 建团任务不存在')
    }
    return task
  }
}

export function toMaterialView(
  material: {
    id: string
    originalFilename: string
    contentType: string
    status: DepartureMaterialStatus
    statusVersion: number
    sha256: string
    sizeBytes: number
    createdAt: Date
  },
  latestResultVersion: number | null,
): DepartureMaterialView {
  return {
    id: material.id,
    originalFilename: material.originalFilename,
    contentType: material.contentType,
    status: material.status,
    statusVersion: material.statusVersion,
    sha256: material.sha256,
    sizeBytes: material.sizeBytes,
    createdAt: material.createdAt.toISOString(),
    latestResultVersion,
  }
}

function reusedMaterial(material: DepartureMaterial & {
  parseRuns: Array<{ resultVersion: number }>
}): ArchivedMaterial {
  const version = material.parseRuns[0]?.resultVersion ?? null
  const ready = CONSUMABLE.includes(material.status) && version != null
  return {
    material,
    parseResultVersion: ready ? version : null,
    needsParseJob: !ready,
    consumedStoredObjectId: null,
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  )
}
