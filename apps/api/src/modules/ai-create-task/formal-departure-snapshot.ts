import { DepartureCreationDraftMode } from '@xiaotuanbao/shared'
import type { Departure } from '@prisma/client'
import type { DepartureCreationDraftSnapshot } from '@xiaotuanbao/shared'
import { formatDateOnly } from '../departure/departure-date.utils'

export function toFormalDepartureSnapshot(
  departure: Departure,
  expectedGuestCountHint: number | null | undefined,
): DepartureCreationDraftSnapshot {
  return {
    // Formal Departure does not retain its copy source id. Once created, it is
    // a standalone business object and must not be projected as an invalid COPY draft.
    mode:
      departure.routeSource === 'template'
        ? DepartureCreationDraftMode.TEMPLATE
        : DepartureCreationDraftMode.MANUAL,
    routeName: departure.routeName,
    templateId: departure.sourceTemplateId,
    copyFromDepartureId: null,
    defaultDayCount: departure.dayCount,
    name: departure.name,
    startDate: formatDateOnly(departure.startDate),
    endDate: formatDateOnly(departure.endDate),
    ownerUserId: departure.ownerUserId,
    departureType: departure.departureType,
    notes: departure.notes,
    driverSupplierId: departure.driverSupplierId,
    guideSupplierId: departure.guideSupplierId,
    vehiclePlate: departure.vehiclePlate,
    contactPhone: departure.contactPhone,
    expectedGuestCountHint: expectedGuestCountHint ?? null,
  }
}
