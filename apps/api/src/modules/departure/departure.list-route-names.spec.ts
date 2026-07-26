import { DepartureService } from './departure.service'

describe('DepartureService.listRouteNames', () => {
  it('按本组织查询去重后的精确 routeName，并按名称升序返回', async () => {
    const prisma = {
      departure: {
        findMany: jest.fn().mockResolvedValue([
          { routeName: '伊犁环线' },
          { routeName: '阿勒泰拼车' },
        ]),
      },
    }

    const service = new DepartureService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )

    const result = await service.listRouteNames('org-1')

    expect(prisma.departure.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        routeName: { not: '' },
      },
      select: { routeName: true },
      distinct: ['routeName'],
      orderBy: { routeName: 'asc' },
    })
    expect(result).toEqual({
      items: ['伊犁环线', '阿勒泰拼车'],
    })
  })

  it('无发团时返回空列表', async () => {
    const prisma = {
      departure: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    }

    const service = new DepartureService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )

    await expect(service.listRouteNames('org-1')).resolves.toEqual({ items: [] })
  })
})
