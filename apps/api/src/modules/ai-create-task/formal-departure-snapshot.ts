import { DepartureCreationDraftMode } from '@xiaotuanbao/shared'
import type { Departure } from '@prisma/client'
import type { DepartureCreationDraftSnapshot } from '@xiaotuanbao/shared'

export function toFormalDepartureSnapshot(
  departure: Departure,
  expectedGuestCountHint: number | null | undefined,
): DepartureCreationDraftSnapshot {
  return {
    mode:
      departure.routeSource === 'template'
        ? DepartureCreationDraftMode.TEMPLATE
        : departure.routeSource === 'copy'
          ? DepartureCreationDraftMode.COPY
          : DepartureCreationDraftMode.MANUAL,
    routeName: departure.routeName,
    templateId: departure.sourceTemplateId,
    copyFromDepartureId: null,
    defaultDayCount: departure.dayCount,
    name: departure.name,
    startDate: departure.startDate.toISOString().slice(0, 10),
    endDate: departure.endDate.toISOString().slice(0, 10),
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
