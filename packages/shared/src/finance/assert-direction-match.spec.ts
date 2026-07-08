import { assertDirectionMatch, DirectionMismatchError } from './assert-direction-match'

describe('assertDirectionMatch', () => {
  it('passes when receivable matches inflow', () => {
    expect(() => assertDirectionMatch('receivable', 'inflow')).not.toThrow()
  })

  it('passes when payable matches outflow', () => {
    expect(() => assertDirectionMatch('payable', 'outflow')).not.toThrow()
  })

  it('rejects receivable with outflow', () => {
    expect(() => assertDirectionMatch('receivable', 'outflow')).toThrow(DirectionMismatchError)
  })

  it('rejects payable with inflow', () => {
    expect(() => assertDirectionMatch('payable', 'inflow')).toThrow(DirectionMismatchError)
  })

  it('rejects unknown schedule direction', () => {
    expect(() => assertDirectionMatch('unknown', 'inflow')).toThrow(DirectionMismatchError)
  })
})
