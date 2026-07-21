import {
  agingBucketForOverdueDays,
  buildReceivableFollowUpDueDateWhere,
  getReceivableFollowUpDates,
  overdueDays,
  receivableFollowUpHref,
} from './receivable-follow-up'
import { formatDateOnly, parseDateOnly } from '../departure/departure-date.utils'

describe('receivable-follow-up', () => {
  const asOf = new Date('2026-07-21T04:00:00.000Z')
  const dates = getReceivableFollowUpDates(asOf)

  it('uses Asia/Shanghai calendar day boundaries for follow-up windows', () => {
    expect(dates).toEqual({
      today: '2026-07-21',
      dueWithin7End: '2026-07-28',
      aging1_7Start: '2026-07-14',
      aging8_30Start: '2026-06-21',
      agingOver30End: '2026-06-20',
    })
  })

  it('classifies overdue day boundaries for aging buckets 7/8/30/31', () => {
    expect(overdueDays('2026-07-21', dates.today)).toBeNull()
    expect(overdueDays('2026-07-20', dates.today)).toBe(1)
    expect(overdueDays('2026-07-14', dates.today)).toBe(7)
    expect(agingBucketForOverdueDays(7)).toBe('aging_1_7')
    expect(overdueDays('2026-07-13', dates.today)).toBe(8)
    expect(agingBucketForOverdueDays(8)).toBe('aging_8_30')
    expect(overdueDays('2026-06-21', dates.today)).toBe(30)
    expect(agingBucketForOverdueDays(30)).toBe('aging_8_30')
    expect(overdueDays('2026-06-20', dates.today)).toBe(31)
    expect(agingBucketForOverdueDays(31)).toBe('aging_over_30')
  })

  it('builds due-date where clauses that match aging and follow-up windows', () => {
    expect(buildReceivableFollowUpDueDateWhere('overdue', dates)).toEqual({
      dueDate: { lt: parseDateOnly('2026-07-21') },
    })
    expect(buildReceivableFollowUpDueDateWhere('due_within_7_days', dates)).toEqual({
      dueDate: {
        gte: parseDateOnly('2026-07-21'),
        lte: parseDateOnly('2026-07-28'),
      },
    })
    expect(buildReceivableFollowUpDueDateWhere('aging_1_7', dates)).toEqual({
      dueDate: {
        gte: parseDateOnly('2026-07-14'),
        lte: parseDateOnly('2026-07-20'),
      },
    })
    expect(buildReceivableFollowUpDueDateWhere('aging_8_30', dates)).toEqual({
      dueDate: {
        gte: parseDateOnly('2026-06-21'),
        lte: parseDateOnly('2026-07-13'),
      },
    })
    expect(buildReceivableFollowUpDueDateWhere('aging_over_30', dates)).toEqual({
      dueDate: { lte: parseDateOnly('2026-06-20') },
    })
    expect(buildReceivableFollowUpDueDateWhere('follow_up', dates)).toEqual({
      dueDate: { lte: parseDateOnly('2026-07-28') },
    })
  })

  it('serializes stable drill-down hrefs', () => {
    expect(receivableFollowUpHref('overdue')).toBe(
      '/finance/receivable?receivableFollowUp=overdue',
    )
    expect(receivableFollowUpHref('aging_over_30')).toBe(
      '/finance/receivable?receivableFollowUp=aging_over_30',
    )
  })

  it('keeps inclusive due-within-7 end on today+7', () => {
    const dueDate = formatDateOnly(parseDateOnly(dates.dueWithin7End))
    expect(dueDate).toBe('2026-07-28')
    expect(dueDate >= dates.today && dueDate <= dates.dueWithin7End).toBe(true)
  })
})
