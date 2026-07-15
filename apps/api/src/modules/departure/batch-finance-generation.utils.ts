import { ConflictException, HttpException } from '@nestjs/common'
import type {
  BatchFinanceGenerationItem,
  BatchFinanceGenerationResult,
} from '@xiaotuanbao/shared'

export function httpExceptionMessage(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse()
    if (typeof response === 'string') {
      return response
    }
    if (typeof response === 'object' && response !== null && 'message' in response) {
      const message = (response as { message: string | string[] }).message
      return Array.isArray(message) ? message.join(', ') : message
    }
  }
  return error instanceof Error ? error.message : '未知错误'
}

export function isAlreadyGeneratedConflict(error: unknown): boolean {
  return (
    error instanceof ConflictException &&
    (httpExceptionMessage(error).includes('不能再次生成') ||
      httpExceptionMessage(error).includes('已生成'))
  )
}

export function summarizeBatchFinanceGeneration(
  items: BatchFinanceGenerationItem[],
): BatchFinanceGenerationResult {
  let succeeded = 0
  let generated = 0
  let skipped = 0
  let failed = 0

  for (const item of items) {
    if (item.outcome === 'succeeded') {
      succeeded += 1
      generated += item.generatedCount ?? 1
    } else if (item.outcome === 'skipped') {
      skipped += 1
    } else {
      failed += 1
    }
  }

  return {
    attempted: items.length,
    succeeded,
    generated,
    skipped,
    failed,
    items,
  }
}
