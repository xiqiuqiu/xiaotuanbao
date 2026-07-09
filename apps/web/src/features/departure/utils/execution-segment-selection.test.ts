import { describe, expect, it } from 'vitest'
import { resolveSelectedSegmentId } from './execution-segment-selection'

describe('resolveSelectedSegmentId', () => {
  const segments = [
    { id: 'seg-b', startDate: '2026-07-04' },
    { id: 'seg-a', startDate: '2026-07-01' },
    { id: 'seg-c', startDate: '2026-07-10' },
  ]

  it('returns undefined when there are no segments', () => {
    expect(resolveSelectedSegmentId([], undefined)).toBeUndefined()
    expect(resolveSelectedSegmentId([], 'seg-a')).toBeUndefined()
  })

  it('defaults to the earliest startDate segment when segmentId is missing', () => {
    expect(resolveSelectedSegmentId(segments, undefined)).toBe('seg-a')
  })

  it('keeps a valid segmentId', () => {
    expect(resolveSelectedSegmentId(segments, 'seg-b')).toBe('seg-b')
  })

  it('falls back to the earliest startDate segment when segmentId is invalid', () => {
    expect(resolveSelectedSegmentId(segments, 'missing')).toBe('seg-a')
  })
})
