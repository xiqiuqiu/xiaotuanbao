import dayjs, { type Dayjs } from 'dayjs'

/**
 * 出团日期区间快捷项（本月/上月/近 3 个月），与《往来账确认单》周期同口径。
 * 每次调用取当前时间，避免跨天/跨月后快捷项过期。
 */
export function buildDepartureDateRangePresets(): { label: string; value: [Dayjs, Dayjs] }[] {
  const now = dayjs()
  return [
    { label: '本月', value: [now.startOf('month'), now.endOf('month')] },
    {
      label: '上月',
      value: [
        now.subtract(1, 'month').startOf('month'),
        now.subtract(1, 'month').endOf('month'),
      ],
    },
    { label: '近 3 个月', value: [now.subtract(3, 'month').startOf('day'), now.endOf('day')] },
  ]
}
