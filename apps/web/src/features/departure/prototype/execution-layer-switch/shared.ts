/** PROTOTYPE mock — 执行安排层级切换 UI 探索。 */

export type ExecutionLayer = 'day' | 'departure'

export type MockDaySegment = {
  id: string
  dayIndex: number
  dateLabel: string
  name: string
  resourceCount: number
  payableLabel: string
  pendingCheck?: boolean
  selected?: boolean
}

export const MOCK_DAYS: MockDaySegment[] = [
  {
    id: 'd1',
    dayIndex: 1,
    dateLabel: '08-04',
    name: '第1天 乌鲁木齐',
    resourceCount: 1,
    payableLabel: '0/1',
    selected: true,
  },
  {
    id: 'd2',
    dayIndex: 2,
    dateLabel: '08-05',
    name: '第2天 喀纳斯-伊宁',
    resourceCount: 2,
    payableLabel: '0/2',
  },
  {
    id: 'd3',
    dayIndex: 3,
    dateLabel: '08-06',
    name: '第3天',
    resourceCount: 1,
    payableLabel: '0/1',
    pendingCheck: true,
  },
]

export const DEPARTURE_PENDING_PAYABLE = 2

export const PROTOTYPE_VARIANTS = [
  { key: 'A', label: '轨道 Segmented（当前方向）' },
  { key: 'B', label: '线型 Tab（无灰底条）' },
  { key: 'C', label: '紧凑工具条（左说明右切换）' },
  { key: 'D', label: '并入内容 Card 页眉' },
] as const

export type PrototypeVariantKey = (typeof PROTOTYPE_VARIANTS)[number]['key']
