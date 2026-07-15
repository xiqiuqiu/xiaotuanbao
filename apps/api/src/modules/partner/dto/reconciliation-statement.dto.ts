import { Matches } from 'class-validator'

/** 仅接受 YYYY-MM-DD（拒绝带时间的 ISO 串，避免拼出非法日期与污染标题/文件名）。 */
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** 对账周期必填（#112 口径：所属发团出团日期区间）；缺失或格式非法即 400。 */
export class ReconciliationStatementQueryDto {
  @Matches(DATE_ONLY_PATTERN, { message: '对账周期开始日期必填且须为 YYYY-MM-DD' })
  periodStart!: string

  @Matches(DATE_ONLY_PATTERN, { message: '对账周期结束日期必填且须为 YYYY-MM-DD' })
  periodEnd!: string
}
