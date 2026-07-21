import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator'
import { Type } from 'class-transformer'
import {
  CounterpartyType as PrismaCounterpartyType,
  PaymentScheduleCloseDisposition as PrismaPaymentScheduleCloseDisposition,
  PaymentScheduleDirection as PrismaPaymentScheduleDirection,
} from '@prisma/client'
import { RECEIVABLE_FOLLOW_UP_WINDOWS } from '../receivable-follow-up'
import { PAYABLE_BALANCE_FILTERS } from '../payable-open-balance'

export class CreatePaymentScheduleDto {
  @IsString()
  @IsNotEmpty()
  departureId!: string

  @IsString()
  @IsNotEmpty()
  title!: string

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '金额必须大于 0' })
  amountCents!: number

  @IsDateString()
  dueDate!: string

  @IsEnum(PrismaCounterpartyType)
  counterpartyType!: PrismaCounterpartyType

  @IsOptional()
  @IsString()
  counterpartyId?: string

  @IsOptional()
  @IsString()
  counterpartyName?: string

  @IsOptional()
  @IsString()
  sourceType?: string

  @IsOptional()
  @IsString()
  sourceId?: string
}

export class UpdatePaymentScheduleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '金额必须大于 0' })
  amountCents?: number

  @IsOptional()
  @IsDateString()
  dueDate?: string

  @IsOptional()
  @IsEnum(PrismaCounterpartyType)
  counterpartyType?: PrismaCounterpartyType

  @IsOptional()
  @IsString()
  counterpartyId?: string | null

  @IsOptional()
  @IsString()
  counterpartyName?: string | null
}

export class ListPaymentSchedulesQueryDto {
  @IsOptional()
  @IsString()
  departureId?: string

  /** 按关联发团出团日期（Departure.startDate）过滤；手工节点随其归属发团落入区间。 */
  @IsOptional()
  @IsDateString()
  departureDateFrom?: string

  @IsOptional()
  @IsDateString()
  departureDateTo?: string

  @IsOptional()
  @IsEnum(PrismaCounterpartyType)
  counterpartyType?: PrismaCounterpartyType

  @IsOptional()
  @IsString()
  counterpartyId?: string

  @IsOptional()
  @IsString()
  counterpartyName?: string

  @IsOptional()
  @IsString()
  counterpartyKeyword?: string

  /** 精确匹配节点编号（工作台队列单项下钻）。 */
  @IsOptional()
  @IsString()
  scheduleNo?: string

  @IsOptional()
  @IsIn(['voided'])
  status?: 'voided'

  /**
   * 工作台应收跟进 / 账龄下钻窗口。
   * 仅应收列表生效：未作废、未关闭、未结金额 > 0，并按窗口约束到期日。
   */
  @IsOptional()
  @IsIn(RECEIVABLE_FOLLOW_UP_WINDOWS)
  receivableFollowUp?: (typeof RECEIVABLE_FOLLOW_UP_WINDOWS)[number]

  /**
   * 工作台待付款下钻。
   * 仅应付列表生效：未作废、未关闭、未付金额 > 0（无到期/逾期窗口）。
   */
  @IsOptional()
  @IsIn(PAYABLE_BALANCE_FILTERS)
  payableBalance?: (typeof PAYABLE_BALANCE_FILTERS)[number]

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number
}

export class PaymentScheduleAggregateQueryDto {
  @IsOptional()
  @IsDateString()
  departureDateFrom?: string

  @IsOptional()
  @IsDateString()
  departureDateTo?: string
}

export class CancelPaymentScheduleDto {
  @IsEnum(PrismaPaymentScheduleCloseDisposition)
  closeDisposition!: PrismaPaymentScheduleCloseDisposition

  @IsString()
  @IsNotEmpty({ message: '关闭说明不能为空' })
  cancelReason!: string
}

export class ReopenPaymentScheduleDto {
  @IsString()
  @IsNotEmpty({ message: '重新打开原因不能为空' })
  reopenReason!: string

  @IsOptional()
  @IsBoolean({ message: '请确认是否联动回退发团结清' })
  confirmDepartureSettlementReversal?: boolean
}

export class AdjustPaymentScheduleAmountDto {
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '金额必须大于 0' })
  amountCents!: number

  @IsString()
  @IsNotEmpty({ message: '调整原因不能为空' })
  adjustReason!: string
}

export class VoidResourcePayableDto {
  @IsString()
  @IsNotEmpty({ message: '作废原因不能为空' })
  @MaxLength(200, { message: '作废原因不能超过 200 个字符' })
  voidReason!: string
}

export {
  PrismaPaymentScheduleDirection as PaymentScheduleDirection,
  PrismaPaymentScheduleCloseDisposition as PaymentScheduleCloseDisposition,
}
