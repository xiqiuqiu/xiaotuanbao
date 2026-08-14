import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  DepartureMaterialParseRunStatus,
  DepartureMaterialStatus,
  type Prisma,
} from '@prisma/client'
import type { DepartureMaterialView } from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'
import { StoredObjectService } from '../stored-object/stored-object.service'
import { ParseWorkerClient } from './parse-worker.client'

const IN_FLIGHT: DepartureMaterialStatus[] = [
  DepartureMaterialStatus.uploaded,
  DepartureMaterialStatus.queued,
  DepartureMaterialStatus.parsing,
]
const CONSUMABLE: DepartureMaterialStatus[] = [
  DepartureMaterialStatus.available,
  DepartureMaterialStatus.partially_available,
]
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  'application/pdf',
])
const MAX_MATERIAL_BYTES = 20 * 1024 * 1024

@Injectable()
export class DepartureMaterialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storedObjectService: StoredObjectService,
    private readonly parseWorkerClient: ParseWorkerClient,
  ) {}

  async upload(
    organizationId: string,
    userId: string,
    taskId: string,
    file: { originalname: string; mimetype?: string; buffer: Buffer; size: number } | undefined,
  ): Promise<DepartureMaterialView> {
    await this.assertOwnedTask(organizationId, userId, taskId)
    if (!file) {
      throw new BadRequestException('请上传文件（multipart 字段名 file）')
    }
    const contentType = (file.mimetype ?? '').toLowerCase()
    if (!ALLOWED_TYPES.has(contentType)) {
      throw new BadRequestException('仅支持 PNG、JPEG、WebP、TIFF 和 PDF')
    }
    if (file.size > MAX_MATERIAL_BYTES || file.buffer.byteLength > MAX_MATERIAL_BYTES) {
      throw new BadRequestException('文件不能超过 20MB')
    }

    const stored = await this.storedObjectService.upload(organizationId, userId, file)
    const material = await this.prisma.departureMaterial.create({
      data: {
        organizationId,
        taskId,
        storedObjectId: stored.id,
        originalFilename: stored.originalFilename,
        contentType: stored.contentType,
        status: DepartureMaterialStatus.queued,
        createdByUserId: userId,
      },
    })
    const run = await this.prisma.departureMaterialParseRun.create({
      data: {
        organizationId,
        materialId: material.id,
        status: DepartureMaterialParseRunStatus.queued,
        resultVersion: 1,
        parserVersions: {},
      },
    })

    void this.executeParse(organizationId, material.id, run.id)
    return this.toView(material, 1)
  }

  async list(organizationId: string, userId: string, taskId: string): Promise<DepartureMaterialView[]> {
    await this.assertOwnedTask(organizationId, userId, taskId)
    return this.listForTask(organizationId, taskId)
  }

  async listForTask(
    organizationId: string,
    taskId: string,
    options?: { createdAtGte?: Date },
  ): Promise<DepartureMaterialView[]> {
    const materials = await this.prisma.departureMaterial.findMany({
      where: {
        organizationId,
        taskId,
        ...(options?.createdAtGte ? { createdAt: { gte: options.createdAtGte } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        parseRuns: { orderBy: { resultVersion: 'desc' }, take: 1 },
      },
    })
    return materials.map((material) =>
      this.toView(material, material.parseRuns[0]?.status === 'succeeded' ? material.parseRuns[0].resultVersion : null),
    )
  }

  async isConsumePending(
    organizationId: string,
    taskId: string,
    options?: { createdAtGte?: Date },
  ): Promise<boolean> {
    const materials = await this.prisma.departureMaterial.findMany({
      where: {
        organizationId,
        taskId,
        ...(options?.createdAtGte ? { createdAt: { gte: options.createdAtGte } } : {}),
      },
      include: {
        parseRuns: { orderBy: { resultVersion: 'desc' }, take: 1 },
      },
    })
    if (materials.length === 0) {
      return false
    }
    if (materials.some((material) => IN_FLIGHT.includes(material.status))) {
      return false
    }
    return materials.some((material) => {
      const run = material.parseRuns[0]
      return (
        CONSUMABLE.includes(material.status) &&
        run?.status === DepartureMaterialParseRunStatus.succeeded &&
        run.consumeStartedAt == null
      )
    })
  }

  async getParseResult(
    organizationId: string,
    userId: string,
    taskId: string,
    materialId: string,
    options?: { createdAtGte?: Date },
  ) {
    await this.assertOwnedTask(organizationId, userId, taskId)
    const material = await this.prisma.departureMaterial.findFirst({
      where: {
        id: materialId,
        organizationId,
        taskId,
        ...(options?.createdAtGte ? { createdAt: { gte: options.createdAtGte } } : {}),
      },
      include: {
        parseRuns: {
          where: { status: DepartureMaterialParseRunStatus.succeeded },
          orderBy: { resultVersion: 'desc' },
          take: 1,
        },
      },
    })
    if (!material) {
      throw new NotFoundException('发团资料档案不存在')
    }
    const run = material.parseRuns[0]
    if (run && run.consumeStartedAt == null) {
      await this.prisma.departureMaterialParseRun.update({
        where: { id: run.id },
        data: { consumeStartedAt: new Date() },
      })
    }
    const pages = Array.isArray(run?.pages) ? run.pages : []
    return {
      materialId: material.id,
      status: material.status,
      resultVersion: run?.resultVersion ?? null,
      pages: (pages as Array<Record<string, unknown>>).map((page) => ({
        pageNumber: Number(page.pageNumber),
        source: page.source === 'native_pdf' ? 'native_pdf' : 'ocr',
        text: String(page.text ?? ''),
        markdown: typeof page.markdown === 'string' ? page.markdown : undefined,
      })),
    }
  }

  async preview(
    organizationId: string,
    userId: string,
    taskId: string,
    materialId: string,
  ) {
    await this.assertOwnedTask(organizationId, userId, taskId)
    const material = await this.prisma.departureMaterial.findFirst({
      where: { id: materialId, organizationId, taskId },
    })
    if (!material) {
      throw new NotFoundException('发团资料档案不存在')
    }
    return this.storedObjectService.download(organizationId, material.storedObjectId)
  }

  private async executeParse(
    organizationId: string,
    materialId: string,
    runId: string,
  ): Promise<void> {
    const material = await this.prisma.departureMaterial.findFirst({
      where: { id: materialId, organizationId },
    })
    if (!material) {
      return
    }

    await this.prisma.departureMaterial.update({
      where: { id: materialId },
      data: { status: DepartureMaterialStatus.parsing, statusVersion: { increment: 1 } },
    })
    await this.prisma.departureMaterialParseRun.update({
      where: { id: runId },
      data: { status: DepartureMaterialParseRunStatus.running, startedAt: new Date() },
    })

    const current = await this.prisma.departureMaterial.findUnique({ where: { id: materialId } })
    if (!current || current.statusVersion < material.statusVersion + 1) {
      return
    }

    try {
      const stored = await this.storedObjectService.download(organizationId, current.storedObjectId)
      const parsed = await this.parseWorkerClient.parse({
        buffer: stored.buffer,
        filename: stored.filename,
        contentType: stored.contentType || current.contentType,
      })
      const latest = await this.prisma.departureMaterial.findUnique({ where: { id: materialId } })
      if (!latest || latest.statusVersion !== current.statusVersion) {
        return
      }
      const failedPages = parsed.pages.filter((page) => !page.text.trim()).length
      const status =
        parsed.pages.length > 0 && failedPages > 0 && failedPages < parsed.pages.length
          ? DepartureMaterialStatus.partially_available
          : parsed.pages.some((page) => page.text.trim())
            ? DepartureMaterialStatus.available
            : DepartureMaterialStatus.failed
      await this.prisma.departureMaterialParseRun.update({
        where: { id: runId },
        data: {
          status: DepartureMaterialParseRunStatus.succeeded,
          pages: parsed.pages as unknown as Prisma.InputJsonValue,
          parserVersions: parsed.parserVersions as Prisma.InputJsonValue,
          endedAt: new Date(),
        },
      })
      await this.prisma.departureMaterial.update({
        where: { id: materialId },
        data: { status, statusVersion: { increment: 1 } },
      })
    } catch {
      const latest = await this.prisma.departureMaterial.findUnique({ where: { id: materialId } })
      if (!latest || latest.statusVersion !== current.statusVersion) {
        return
      }
      await this.prisma.departureMaterialParseRun.update({
        where: { id: runId },
        data: {
          status: DepartureMaterialParseRunStatus.failed,
          errorCode: 'PARSE_FAILED',
          endedAt: new Date(),
        },
      })
      await this.prisma.departureMaterial.update({
        where: { id: materialId },
        data: { status: DepartureMaterialStatus.failed, statusVersion: { increment: 1 } },
      })
    }
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

  private toView(
    material: {
      id: string
      originalFilename: string
      contentType: string
      status: DepartureMaterialStatus
      statusVersion: number
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
      createdAt: material.createdAt.toISOString(),
      latestResultVersion,
    }
  }
}
