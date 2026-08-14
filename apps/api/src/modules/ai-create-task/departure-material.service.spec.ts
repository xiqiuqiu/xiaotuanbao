import { BadRequestException } from '@nestjs/common'
import { DepartureMaterialParseRunStatus, DepartureMaterialStatus } from '@prisma/client'
import { DepartureMaterialService } from './departure-material.service'

describe('DepartureMaterialService.isConsumePending', () => {
  function createService(materials: unknown[]) {
    const prisma = {
      departureMaterial: {
        findMany: jest.fn().mockResolvedValue(materials),
      },
    }
    const service = new DepartureMaterialService(prisma as never, {} as never, {} as never)
    return { service, prisma }
  }

  it('is false while any archive is still parsing', async () => {
    const { service } = createService([
      {
        status: DepartureMaterialStatus.available,
        parseRuns: [
          {
            status: DepartureMaterialParseRunStatus.succeeded,
            consumeStartedAt: null,
          },
        ],
      },
      {
        status: DepartureMaterialStatus.parsing,
        parseRuns: [{ status: DepartureMaterialParseRunStatus.running, consumeStartedAt: null }],
      },
    ])

    await expect(service.isConsumePending('org-1', 'task-1')).resolves.toBe(false)
  })

  it('is true when all archives left flight and a succeeded run is unconsumed', async () => {
    const { service } = createService([
      {
        status: DepartureMaterialStatus.available,
        parseRuns: [
          {
            status: DepartureMaterialParseRunStatus.succeeded,
            consumeStartedAt: null,
          },
        ],
      },
      {
        status: DepartureMaterialStatus.failed,
        parseRuns: [{ status: DepartureMaterialParseRunStatus.failed, consumeStartedAt: null }],
      },
    ])

    await expect(service.isConsumePending('org-1', 'task-1')).resolves.toBe(true)
  })

  it('scopes the query to archives created in the current assist window', async () => {
    const since = new Date('2026-08-14T01:00:00.000Z')
    const { service, prisma } = createService([])

    await expect(service.isConsumePending('org-1', 'task-1', { createdAtGte: since })).resolves.toBe(
      false,
    )
    expect(prisma.departureMaterial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          taskId: 'task-1',
          createdAt: { gte: since },
        }),
      }),
    )
  })

  it('is false after consumeStartedAt is written', async () => {
    const { service } = createService([
      {
        status: DepartureMaterialStatus.available,
        parseRuns: [
          {
            status: DepartureMaterialParseRunStatus.succeeded,
            consumeStartedAt: new Date('2026-08-14T00:00:00.000Z'),
          },
        ],
      },
    ])

    await expect(service.isConsumePending('org-1', 'task-1')).resolves.toBe(false)
  })
})

describe('DepartureMaterialService.getParseResult', () => {
  it('does not read archives created before the current assist window', async () => {
    const since = new Date('2026-08-14T01:00:00.000Z')
    const findFirst = jest.fn().mockResolvedValueOnce({ id: 'task-1' }).mockResolvedValueOnce(null)
    const service = new DepartureMaterialService(
      {
        aiCreateTask: { findFirst },
        departureMaterial: { findFirst },
      } as never,
      {} as never,
      {} as never,
    )

    await expect(
      service.getParseResult('org-1', 'user-1', 'task-1', 'mat-old', { createdAtGte: since }),
    ).rejects.toMatchObject({ message: '发团资料档案不存在' })
    expect(findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'mat-old',
          createdAt: { gte: since },
        }),
      }),
    )
  })
})

describe('DepartureMaterialService.upload', () => {
  it('rejects files over 20MB before storing', async () => {
    const service = new DepartureMaterialService(
      {
        aiCreateTask: {
          findFirst: jest.fn().mockResolvedValue({ id: 'task-1' }),
        },
      } as never,
      { upload: jest.fn() } as never,
      {} as never,
    )

    await expect(
      service.upload('org-1', 'user-1', 'task-1', {
        originalname: 'huge.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.alloc(1),
        size: 20 * 1024 * 1024 + 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
