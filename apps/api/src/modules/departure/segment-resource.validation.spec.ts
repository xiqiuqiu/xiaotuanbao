import { BadRequestException } from '@nestjs/common'
import { CounterpartyType, ResourceKind } from '@prisma/client'
import {
  resolveSegmentResourceCounterparty,
  resolveSegmentResourceCounterpartyForUpdate,
} from './segment-resource.validation'

describe('resolveSegmentResourceCounterparty', () => {
  it('requires supplierId on create/write path', () => {
    expect(() =>
      resolveSegmentResourceCounterparty({
        resourceKind: ResourceKind.outsource,
        partnerId: 'partner-1',
      }),
    ).toThrow(new BadRequestException('请选择供应商'))
  })

  it('rejects partnerId together with supplierId', () => {
    expect(() =>
      resolveSegmentResourceCounterparty({
        resourceKind: ResourceKind.outsource,
        partnerId: 'partner-1',
        supplierId: 'supplier-1',
      }),
    ).toThrow(new BadRequestException('资源不能同时关联客户与供应商'))
  })

  it('accepts supplier-only counterparty', () => {
    expect(
      resolveSegmentResourceCounterparty({
        resourceKind: ResourceKind.outsource,
        supplierId: 'supplier-1',
      }),
    ).toEqual({
      counterpartyType: CounterpartyType.supplier,
      partnerId: null,
      supplierId: 'supplier-1',
    })
  })
})

describe('resolveSegmentResourceCounterpartyForUpdate', () => {
  const historicalPartner = {
    counterpartyType: CounterpartyType.partner,
    partnerId: 'partner-1',
    supplierId: null,
  }

  it('preserves historical partner outsource when no supplier is provided', () => {
    expect(
      resolveSegmentResourceCounterpartyForUpdate({
        resourceKind: ResourceKind.outsource,
        supplierId: undefined,
        existing: historicalPartner,
      }),
    ).toEqual({
      counterpartyType: CounterpartyType.partner,
      partnerId: 'partner-1',
      supplierId: null,
    })
  })

  it('migrates historical partner to supplier when supplierId is provided', () => {
    expect(
      resolveSegmentResourceCounterpartyForUpdate({
        resourceKind: ResourceKind.outsource,
        supplierId: 'supplier-travel',
        existing: historicalPartner,
      }),
    ).toEqual({
      counterpartyType: CounterpartyType.supplier,
      partnerId: null,
      supplierId: 'supplier-travel',
    })
  })

  it('rejects changing partnerId on historical rows without supplier', () => {
    expect(() =>
      resolveSegmentResourceCounterpartyForUpdate({
        resourceKind: ResourceKind.outsource,
        partnerId: 'partner-2',
        existing: historicalPartner,
      }),
    ).toThrow(new BadRequestException('写路径不再接受更换承接方，请选择供应商'))
  })

  it('requires supplier when changing resourceKind away from outsource', () => {
    expect(() =>
      resolveSegmentResourceCounterpartyForUpdate({
        resourceKind: ResourceKind.hotel,
        existing: historicalPartner,
      }),
    ).toThrow(new BadRequestException('请选择供应商'))
  })

  it('requires supplier for supplier-backed resources without supplierId', () => {
    expect(() =>
      resolveSegmentResourceCounterpartyForUpdate({
        resourceKind: ResourceKind.transport,
        existing: {
          counterpartyType: CounterpartyType.supplier,
          partnerId: null,
          supplierId: null,
        },
      }),
    ).toThrow(new BadRequestException('请选择供应商'))
  })
})
