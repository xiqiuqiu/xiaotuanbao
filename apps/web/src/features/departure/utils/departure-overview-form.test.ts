import { describe, expect, it } from 'vitest'
import { DepartureType } from '@xiaotuanbao/shared'
import {
  buildUpdateDeparturePayload,
  departureToFormValues,
} from './departure-overview-form'

describe('departure overview crew form (issue #206)', () => {
  it('loads crew fields and preserves explicit clears in the update payload', () => {
    const departure = {
      departureNo: 'D202607-0206',
      name: '北疆执行团',
      routeName: '北疆线',
      departureType: DepartureType.COMBINED,
      startDate: '2026-08-01',
      endDate: '2026-08-05',
      dayCount: 5,
      ownerUserId: 'owner-1',
      driverSupplierId: 'supplier-driver',
      guideSupplierId: 'supplier-guide',
      vehiclePlate: '新A·20601',
      notes: null,
    }

    expect(departureToFormValues(departure as never)).toMatchObject({
      driverSupplierId: 'supplier-driver',
      guideSupplierId: 'supplier-guide',
      vehiclePlate: '新A·20601',
    })

    expect(
      buildUpdateDeparturePayload({
        ...departureToFormValues(departure as never),
        driverSupplierId: undefined,
        guideSupplierId: undefined,
        vehiclePlate: undefined,
      }),
    ).toMatchObject({
      driverSupplierId: null,
      guideSupplierId: null,
      vehiclePlate: null,
    })
  })
})
