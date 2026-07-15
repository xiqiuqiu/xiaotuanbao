import { ConflictException } from '@nestjs/common'
import {
  httpExceptionMessage,
  isAlreadyGeneratedConflict,
  summarizeBatchFinanceGeneration,
} from './batch-finance-generation.utils'

describe('batch-finance-generation.utils', () => {
  it('summarizes mixed outcomes', () => {
    expect(
      summarizeBatchFinanceGeneration([
        {
          sourceId: 'a',
          sourceLabel: 'A',
          outcome: 'succeeded',
          generatedCount: 2,
        },
        { sourceId: 'b', sourceLabel: 'B', outcome: 'skipped', reason: '金额为 0' },
        { sourceId: 'c', sourceLabel: 'C', outcome: 'failed', reason: '出错' },
        { sourceId: 'd', sourceLabel: 'D', outcome: 'skipped' },
      ]),
    ).toEqual({
      attempted: 4,
      succeeded: 1,
      generated: 2,
      skipped: 2,
      failed: 1,
      items: expect.any(Array),
    })
  })

  it('treats regenerate conflicts as already-generated skips', () => {
    expect(
      isAlreadyGeneratedConflict(
        new ConflictException('当前客源单已生成应收，不能再次生成'),
      ),
    ).toBe(true)
    expect(isAlreadyGeneratedConflict(new ConflictException('发团已关闭，不可生成应收'))).toBe(
      false,
    )
  })

  it('reads nest http exception messages', () => {
    expect(httpExceptionMessage(new ConflictException('当前资源已生成应付，不能再次生成'))).toBe(
      '当前资源已生成应付，不能再次生成',
    )
  })
})
