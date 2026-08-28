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
  ConversationSourceParseRunStatus,
  ConversationSourceStatus,
  type ConversationSource,
  type Prisma,
} from '@prisma/client'
import type { ConversationSourceView, StoredObjectSummary } from '@xiaotuanbao/shared'
import { buildMaterialParseIndex, projectParseResultPages } from '@xiaotuanbao/ai-contracts'
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

const CONSUMABLE: ConversationSourceStatus[] = [
  ConversationSourceStatus.available,
  ConversationSourceStatus.partially_available,
]

export type IncomingMaterialFile = {
  originalname: string
  mimetype?: string
  buffer: Buffer
  size: number
}

export type ArchivedSource = {
  source: ConversationSource
  parseVersion: number | null
  contentDigest: string
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
    conversationId?: string
    files: IncomingMaterialFile[]
  }): Promise<PreparedMaterialUploads> {
    const storedByFileKey = new Map<string, StoredObjectSummary>()
    const uploadedIds: string[] = []
    try {
      for (const file of params.files) {
        const contentType = (file.mimetype ?? '').toLowerCase()
        if (params.conversationId) {
          const existing = await this.prisma.conversationSource.findUnique({
            where: {
              conversationId_sha256_sizeBytes_contentType: {
                conversationId: params.conversationId,
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

  async archiveForConversation(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string
      userId: string
      conversationId: string
      file: IncomingMaterialFile
      stored?: StoredObjectSummary
    },
  ): Promise<ArchivedSource> {
    const contentType = (params.file.mimetype ?? '').toLowerCase()
    const sha256 = this.sha256(params.file.buffer)
    const existing = await tx.conversationSource.findUnique({
      where: {
        conversationId_sha256_sizeBytes_contentType: {
          conversationId: params.conversationId,
          sha256,
          sizeBytes: params.file.buffer.byteLength,
          contentType,
        },
      },
      include: {
        parseRuns: {
          where: { status: ConversationSourceParseRunStatus.succeeded },
          orderBy: { resultVersion: 'desc' },
          take: 1,
        },
      },
    })
    if (existing) {
      return reusedSource(existing)
    }

    const stored = params.stored
    if (!stored) {
      throw new ConflictException('资料归档冲突，请重试')
    }

    try {
      const source = await tx.conversationSource.create({
        data: {
          organizationId: params.organizationId,
          conversationId: params.conversationId,
          kind: 'upload',
          storedObjectId: stored.id,
          originalFilename: stored.originalFilename,
          contentType,
          sizeBytes: params.file.buffer.byteLength,
          sha256,
          status: ConversationSourceStatus.queued,
          createdByUserId: params.userId,
        },
      })
      await tx.conversationSourceParseRun.create({
        data: {
          organizationId: params.organizationId,
          sourceId: source.id,
          status: ConversationSourceParseRunStatus.queued,
          resultVersion: 1,
          parserVersions: {},
        },
      })
      return {
        source,
        parseVersion: null,
        contentDigest: sha256,
        needsParseJob: true,
        consumedStoredObjectId: stored.id,
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await tx.conversationSource.findUniqueOrThrow({
          where: {
            conversationId_sha256_sizeBytes_contentType: {
              conversationId: params.conversationId,
              sha256,
              sizeBytes: params.file.buffer.byteLength,
              contentType,
            },
          },
          include: {
            parseRuns: {
              where: { status: ConversationSourceParseRunStatus.succeeded },
              orderBy: { resultVersion: 'desc' },
              take: 1,
            },
          },
        })
        return reusedSource(raced)
      }
      throw error
    }
  }

  async enqueueParseJob(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string
      taskId?: string | null
      conversationId: string
      inputBatchId: string
      sourceId: string
    },
  ): Promise<void> {
    const jobKey = materialParseJobKey(params.sourceId)
    await tx.aiWorkflowJob.upsert({
      where: { jobKey },
      create: {
        organizationId: params.organizationId,
        taskId: params.taskId ?? undefined,
        conversationId: params.conversationId,
        inputBatchId: params.inputBatchId,
        sourceId: params.sourceId,
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

  async list(
    organizationId: string,
    userId: string,
    taskId: string,
  ): Promise<import('@xiaotuanbao/shared').DepartureMaterialView[]> {
    const sources = await this.prisma.conversationSource.findMany({
      where: {
        organizationId,
        conversation: {
          creatorUserId: userId,
          taskLinks: { some: { taskId } },
        },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        parseRuns: { orderBy: { resultVersion: 'desc' }, take: 1 },
      },
    })
    return sources.map((source) => {
      const view = toSourceView(
        source,
        source.parseRuns[0]?.status === ConversationSourceParseRunStatus.succeeded
          ? source.parseRuns[0].resultVersion
          : null,
      )
      return {
        id: view.id,
        originalFilename: view.originalFilename,
        contentType: view.contentType,
        status: view.status,
        statusVersion: view.statusVersion,
        sha256: view.sha256,
        sizeBytes: view.sizeBytes,
        createdAt: view.createdAt,
        latestResultVersion: view.latestParseVersion,
      }
    })
  }

  async preview(organizationId: string, userId: string, taskId: string, materialId: string) {
    const source = await this.prisma.conversationSource.findFirst({
      where: {
        id: materialId,
        organizationId,
        conversation: {
          creatorUserId: userId,
          taskLinks: { some: { taskId } },
        },
      },
    })
    if (!source) {
      throw new NotFoundException('会话来源不存在')
    }
    return this.storedObjectService.download(organizationId, source.storedObjectId)
  }

  async listConversationSources(
    organizationId: string,
    userId: string,
    conversationId: string,
  ): Promise<ConversationSourceView[]> {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id: conversationId, organizationId, creatorUserId: userId },
      select: { id: true },
    })
    if (!conversation) {
      throw new NotFoundException('会话不存在')
    }
    const sources = await this.prisma.conversationSource.findMany({
      where: { organizationId, conversationId },
      orderBy: { createdAt: 'asc' },
      include: {
        parseRuns: { orderBy: { resultVersion: 'desc' }, take: 1 },
      },
    })
    return sources.map((source) =>
      toSourceView(
        source,
        source.parseRuns[0]?.status === ConversationSourceParseRunStatus.succeeded
          ? source.parseRuns[0].resultVersion
          : null,
      ),
    )
  }

  async previewConversationSource(
    organizationId: string,
    userId: string,
    conversationId: string,
    sourceId: string,
  ) {
    const source = await this.prisma.conversationSource.findFirst({
      where: {
        id: sourceId,
        organizationId,
        conversationId,
        conversation: { creatorUserId: userId },
      },
    })
    if (!source) {
      throw new NotFoundException('会话来源不存在')
    }
    return this.storedObjectService.download(organizationId, source.storedObjectId)
  }

  async getPinnedParseResult(params: {
    organizationId: string
    inputBatchId: string
    conversationId?: string
    sourceId: string
    parseVersion: number
    pageNumber?: number
  }) {
    const dependency = await this.prisma.inputBatchSource.findFirst({
      where: {
        organizationId: params.organizationId,
        inputBatchId: params.inputBatchId,
        sourceId: params.sourceId,
        parseVersion: params.parseVersion,
      },
    })
    const conversationSource = dependency
      ? null
      : params.conversationId
        ? await this.prisma.conversationSource.findFirst({
            where: {
              id: params.sourceId,
              organizationId: params.organizationId,
              conversationId: params.conversationId,
            },
            select: { id: true },
          })
        : null
    if (!dependency && !conversationSource) {
      throw new NotFoundException('该批次未固定此解析版本')
    }
    const run = await this.prisma.conversationSourceParseRun.findFirst({
      where: {
        sourceId: params.sourceId,
        resultVersion: params.parseVersion,
        status: ConversationSourceParseRunStatus.succeeded,
      },
    })
    if (!run) {
      throw new NotFoundException('会话来源解析结果不存在')
    }
    const projected = projectParseResultPages(mapParsePages(run.pages), params.pageNumber)
    if (params.pageNumber != null && projected.pages.length === 0) {
      throw new NotFoundException('会话来源解析页不存在')
    }
    return {
      materialId: params.sourceId,
      parseResultVersion: run.resultVersion,
      pageCount: projected.pageCount,
      truncated: projected.truncated,
      pages: projected.pages,
    }
  }

  async loadPinnedParseIndex(organizationId: string, inputBatchId: string) {
    const deps = await this.prisma.inputBatchSource.findMany({
      where: {
        organizationId,
        inputBatchId,
        required: true,
        parseVersion: { not: null },
      },
      orderBy: { createdAt: 'asc' },
    })
    if (deps.length === 0) {
      return { materials: [], truncationReasons: [] as string[] }
    }
    const runs = await this.prisma.conversationSourceParseRun.findMany({
      where: {
        status: ConversationSourceParseRunStatus.succeeded,
        OR: deps.map((item) => ({
          sourceId: item.sourceId,
          resultVersion: item.parseVersion as number,
        })),
      },
      select: { sourceId: true, resultVersion: true, pages: true },
    })
    const runByKey = new Map(
      runs.map((run) => [`${run.sourceId}:${run.resultVersion}`, run] as const),
    )
    return buildMaterialParseIndex(
      deps.map((item) => {
        const parseResultVersion = item.parseVersion as number
        const run = runByKey.get(`${item.sourceId}:${parseResultVersion}`)
        return {
          materialId: item.sourceId,
          parseResultVersion,
          pages: mapParsePages(run?.pages),
        }
      }),
    )
  }

  async loadConversationSourceCatalog(params: {
    organizationId: string
    conversationId: string
    inputBatchId: string
  }) {
    const sources = await this.prisma.conversationSource.findMany({
      where: {
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        status: { in: CONSUMABLE },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        parseRuns: {
          where: { status: ConversationSourceParseRunStatus.succeeded },
          orderBy: { resultVersion: 'desc' },
          take: 1,
        },
      },
    })
    const ready = sources.flatMap((source) => {
      const run = source.parseRuns[0]
      if (!run) {
        return []
      }
      return [
        {
          materialId: source.id,
          parseResultVersion: run.resultVersion,
          originalFilename: source.originalFilename,
          contentDigest: source.sha256,
          pages: mapParsePages(run.pages),
        },
      ]
    })
    if (ready.length === 0) {
      return {
        materials: [],
        truncationReasons: [] as string[],
        sourceVersions: [] as Array<{ sourceId: string; parseVersion: number; contentDigest: string }>,
      }
    }
    const built = buildMaterialParseIndex(ready)
    const pinnedIds = new Set(
      (
        await this.prisma.inputBatchSource.findMany({
          where: { inputBatchId: params.inputBatchId, parseVersion: { not: null } },
          select: { sourceId: true },
        })
      ).map((item) => item.sourceId),
    )
    return {
      materials: built.materials.map((item, index) => ({
        ...item,
        originalFilename: ready[index]?.originalFilename,
        requiredThisBatch: pinnedIds.has(item.materialId),
      })),
      truncationReasons: built.truncationReasons,
      sourceVersions: ready.map((item) => ({
        sourceId: item.materialId,
        parseVersion: item.parseResultVersion,
        contentDigest: item.contentDigest,
      })),
    }
  }

  async executeParseJob(job: {
    id: string
    organizationId: string
    sourceId: string | null
  }): Promise<{ sourceId: string; parseVersion: number; contentDigest: string } | null> {
    if (!job.sourceId) {
      return null
    }
    const source = await this.prisma.conversationSource.findFirst({
      where: { id: job.sourceId, organizationId: job.organizationId },
      include: {
        parseRuns: { orderBy: { resultVersion: 'desc' }, take: 1 },
      },
    })
    if (!source) {
      return null
    }
    const run = source.parseRuns[0]
    if (!run || run.status === ConversationSourceParseRunStatus.failed) {
      return null
    }
    if (
      run.status === ConversationSourceParseRunStatus.succeeded &&
      CONSUMABLE.includes(source.status)
    ) {
      await this.finishParseJob(job.id)
      return {
        sourceId: source.id,
        parseVersion: run.resultVersion,
        contentDigest: source.sha256,
      }
    }

    await this.prisma.conversationSource.update({
      where: { id: source.id },
      data: { status: ConversationSourceStatus.parsing, statusVersion: { increment: 1 } },
    })
    await this.prisma.conversationSourceParseRun.update({
      where: { id: run.id },
      data: { status: ConversationSourceParseRunStatus.running, startedAt: new Date() },
    })

    const stored = await this.storedObjectService.download(job.organizationId, source.storedObjectId)
    const parsed = await this.parseWorkerClient.parse({
      buffer: stored.buffer,
      filename: stored.filename,
      contentType: stored.contentType || source.contentType,
    })
    const failedPages = parsed.pages.filter((page) => !page.text.trim()).length
    const status =
      parsed.pages.length > 0 && failedPages > 0 && failedPages < parsed.pages.length
        ? ConversationSourceStatus.partially_available
        : parsed.pages.some((page) => page.text.trim())
          ? ConversationSourceStatus.available
          : ConversationSourceStatus.failed
    const resultVersion = run.resultVersion
    await this.prisma.$transaction(async (tx) => {
      await tx.conversationSourceParseRun.update({
        where: { id: run.id },
        data: {
          status:
            status === ConversationSourceStatus.failed
              ? ConversationSourceParseRunStatus.failed
              : ConversationSourceParseRunStatus.succeeded,
          pages: parsed.pages as unknown as Prisma.InputJsonValue,
          parserVersions: parsed.parserVersions as Prisma.InputJsonValue,
          errorCode: status === ConversationSourceStatus.failed ? PARSE_FAILED_ERROR_CODE : null,
          endedAt: new Date(),
        },
      })
      await tx.conversationSource.update({
        where: { id: source.id },
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
      return {
        sourceId: source.id,
        parseVersion: resultVersion,
        contentDigest: source.sha256,
      }
    }
    return null
  }

  async markParseTerminalFailure(sourceId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.conversationSource.updateMany({
        where: {
          id: sourceId,
          status: {
            in: [ConversationSourceStatus.queued, ConversationSourceStatus.parsing],
          },
        },
        data: { status: ConversationSourceStatus.failed, statusVersion: { increment: 1 } },
      })
      await tx.conversationSourceParseRun.updateMany({
        where: {
          sourceId,
          status: {
            in: [
              ConversationSourceParseRunStatus.queued,
              ConversationSourceParseRunStatus.running,
            ],
          },
        },
        data: {
          status: ConversationSourceParseRunStatus.failed,
          errorCode: PARSE_FAILED_ERROR_CODE,
          endedAt: new Date(),
        },
      })
    })
  }

  async pinSourceVersion(
    sourceId: string,
    parseVersion: number,
    contentDigest: string,
  ): Promise<string[]> {
    const waiting = await this.prisma.inputBatchSource.findMany({
      where: {
        sourceId,
        required: true,
        parseVersion: null,
        inputBatch: { status: AiInputBatchStatus.waiting_for_materials },
      },
      select: { id: true, inputBatchId: true },
    })
    if (waiting.length === 0) {
      return []
    }
    await this.prisma.inputBatchSource.updateMany({
      where: { id: { in: waiting.map((item) => item.id) } },
      data: { parseVersion, contentDigest },
    })
    return [...new Set(waiting.map((item) => item.inputBatchId))]
  }

  async startNewParseRun(
    tx: Prisma.TransactionClient,
    params: { organizationId: string; sourceId: string },
  ): Promise<number> {
    const latest = await tx.conversationSourceParseRun.findFirst({
      where: { sourceId: params.sourceId },
      orderBy: { resultVersion: 'desc' },
    })
    const resultVersion = (latest?.resultVersion ?? 0) + 1
    await tx.conversationSourceParseRun.create({
      data: {
        organizationId: params.organizationId,
        sourceId: params.sourceId,
        status: ConversationSourceParseRunStatus.queued,
        resultVersion,
        parserVersions: {},
      },
    })
    await tx.conversationSource.update({
      where: { id: params.sourceId },
      data: { status: ConversationSourceStatus.queued, statusVersion: { increment: 1 } },
    })
    return resultVersion
  }

  private async finishParseJob(jobId: string): Promise<void> {
    await this.prisma.aiWorkflowJob.update({
      where: { id: jobId },
      data: { status: AiWorkflowJobStatus.succeeded, leaseExpiresAt: null },
    })
  }
}

export function toSourceView(
  source: {
    id: string
    kind: string
    originalFilename: string
    contentType: string
    status: ConversationSourceStatus
    statusVersion: number
    sha256: string
    sizeBytes: number
    createdAt: Date
  },
  latestParseVersion: number | null,
): ConversationSourceView {
  return {
    id: source.id,
    kind: source.kind as ConversationSourceView['kind'],
    originalFilename: source.originalFilename,
    contentType: source.contentType,
    status: source.status,
    statusVersion: source.statusVersion,
    sha256: source.sha256,
    sizeBytes: source.sizeBytes,
    createdAt: source.createdAt.toISOString(),
    latestParseVersion,
  }
}

function mapParsePages(pages: unknown): Array<{
  pageNumber: number
  source: 'native_pdf' | 'ocr'
  text: string
}> {
  if (!Array.isArray(pages)) {
    return []
  }
  return pages.flatMap((page) => {
    if (!page || typeof page !== 'object') {
      return []
    }
    const record = page as Record<string, unknown>
    const pageNumber = Number(record.pageNumber)
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      return []
    }
    return [
      {
        pageNumber,
        source: record.source === 'native_pdf' ? ('native_pdf' as const) : ('ocr' as const),
        text: String(record.text ?? ''),
      },
    ]
  })
}

function reusedSource(source: ConversationSource & {
  parseRuns: Array<{ resultVersion: number }>
}): ArchivedSource {
  const version = source.parseRuns[0]?.resultVersion ?? null
  const ready = CONSUMABLE.includes(source.status) && version != null
  return {
    source,
    parseVersion: ready ? version : null,
    contentDigest: source.sha256,
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
