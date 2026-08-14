import { createHash } from 'node:crypto'
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  AiWorkflowJobStatus,
  AiWorkflowJobType,
  DepartureMaterialParseRunStatus,
  DepartureMaterialStatus,
  type DepartureMaterial,
  type Prisma,
} from '@prisma/client'
import type { DepartureMaterialView } from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'
import { StoredObjectService } from '../stored-object/stored-object.service'
import {
  MATERIAL_ALLOWED_CONTENT_TYPES,
  MATERIAL_MAX_BYTES,
  MATERIAL_MAX_FILES_PER_SEND,
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
}

@Injectable()
export class DepartureMaterialService {
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

  async archiveForTask(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string
      userId: string
      taskId: string
      file: IncomingMaterialFile
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
      const version = existing.parseRuns[0]?.resultVersion ?? null
      const ready = CONSUMABLE.includes(existing.status) && version != null
      return {
        material: existing,
        parseResultVersion: ready ? version : null,
        needsParseJob: !ready,
      }
    }

    const stored = await this.storedObjectService.upload(
      params.organizationId,
      params.userId,
      params.file,
    )
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
      return { material, parseResultVersion: null, needsParseJob: true }
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
        const version = raced.parseRuns[0]?.resultVersion ?? null
        const ready = CONSUMABLE.includes(raced.status) && version != null
        return {
          material: raced,
          parseResultVersion: ready ? version : null,
          needsParseJob: !ready,
        }
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
    await tx.aiWorkflowJob.upsert({
      where: { jobKey: materialParseJobKey(params.materialId) },
      create: {
        organizationId: params.organizationId,
        taskId: params.taskId,
        conversationId: params.conversationId,
        inputBatchId: params.inputBatchId,
        materialId: params.materialId,
        type: AiWorkflowJobType.material_parse,
        jobKey: materialParseJobKey(params.materialId),
        status: AiWorkflowJobStatus.pending,
      },
      update: {},
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
    if (!run) {
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
          errorCode: status === DepartureMaterialStatus.failed ? 'PARSE_FAILED' : null,
          endedAt: new Date(),
        },
      })
      await tx.departureMaterial.update({
        where: { id: material.id },
        data: { status, statusVersion: { increment: 1 } },
      })
      await tx.aiWorkflowJob.update({
        where: { id: job.id },
        data: {
          status:
            status === DepartureMaterialStatus.failed
              ? AiWorkflowJobStatus.failed
              : AiWorkflowJobStatus.succeeded,
          lastErrorCode: status === DepartureMaterialStatus.failed ? 'PARSE_FAILED' : null,
          leaseExpiresAt: null,
        },
      })
    })
    if (CONSUMABLE.includes(status)) {
      return { materialId: material.id, parseResultVersion: resultVersion }
    }
    return null
  }

  async pinMaterialVersion(materialId: string, parseResultVersion: number): Promise<string[]> {
    await this.prisma.aiInputBatchMaterial.updateMany({
      where: { materialId, parseResultVersion: null },
      data: { parseResultVersion },
    })
    const dependencies = await this.prisma.aiInputBatchMaterial.findMany({
      where: { materialId, required: true },
      select: { inputBatchId: true },
    })
    return [...new Set(dependencies.map((item) => item.inputBatchId))]
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

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  )
}
