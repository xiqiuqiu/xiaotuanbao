import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  }
  return value
}

function requestHash(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(payload)))
    .digest('hex')
}

@Injectable()
export class FinanceIdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T>(params: {
    organizationId: string
    operation: string
    idempotencyKey?: string
    request: unknown
    handler: (tx: Prisma.TransactionClient) => Promise<T>
  }): Promise<T> {
    const key = params.idempotencyKey?.trim()
    if (!key) {
      throw new BadRequestException('财务写请求必须提供 Idempotency-Key 幂等键')
    }
    if (key.length > 200) {
      throw new BadRequestException('幂等键长度不能超过 200 个字符')
    }

    const hash = requestHash(params.request)
    return this.prisma.$transaction(async (tx) => {
      const lockScope = `${params.organizationId}|${params.operation}|${key}`
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockScope}, 0))::text AS lock
      `

      const record = await tx.financeIdempotencyRecord.upsert({
        where: {
          organizationId_operation_idempotencyKey: {
            organizationId: params.organizationId,
            operation: params.operation,
            idempotencyKey: key,
          },
        },
        create: {
          organizationId: params.organizationId,
          operation: params.operation,
          idempotencyKey: key,
          requestHash: hash,
        },
        update: {},
      })

      if (record.requestHash !== hash) {
        throw new ConflictException('幂等键已被其他请求载荷使用')
      }
      if (record.completedAt) {
        if (!record.resultJson || Array.isArray(record.resultJson)) {
          throw new ConflictException('幂等请求结果不可用，请联系管理员')
        }
        return record.resultJson as T
      }

      const result = await params.handler(tx)
      await tx.financeIdempotencyRecord.update({
        where: { id: record.id },
        data: {
          resultJson: canonicalize(result) as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      })
      return result
    })
  }
}
