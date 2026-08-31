import { DepartureCreationDraftMode } from '@xiaotuanbao/shared'
import { DepartureRouteSource } from '@prisma/client'
import { toFormalDepartureSnapshot } from './formal-departure-snapshot'

describe('toFormalDepartureSnapshot', () => {
  it('projects a copied formal Departure as a valid standalone snapshot', () => {
    const snapshot = toFormalDepartureSnapshot(
      {
        routeSource: DepartureRouteSource.copy,
        routeName: '川西环线',
        sourceTemplateId: null,
        dayCount: 5,
        name: '九月团',
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-05T00:00:00.000Z'),
        ownerUserId: 'user-1',
        departureType: 'combined',
        notes: null,
        driverSupplierId: null,
        guideSupplierId: null,
        vehiclePlate: null,
        contactPhone: null,
      } as never,
      8,
    )

    expect(snapshot).toMatchObject({
      mode: DepartureCreationDraftMode.MANUAL,
      routeName: '川西环线',
      copyFromDepartureId: null,
      expectedGuestCountHint: 8,
    })
  })
})
