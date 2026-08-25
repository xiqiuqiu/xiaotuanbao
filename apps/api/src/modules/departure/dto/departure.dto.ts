import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator'
import { Transform, Type } from 'class-transformer'
import {
  DepartureProgress,
} from '@xiaotuanbao/shared'
import { DepartureStatus as PrismaDepartureStatus, DepartureType as PrismaDepartureType } from '@prisma/client'
import type { DepartureOperationalWindow } from '../departure-operational-window'

export class CreateDepartureDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsString()
  @IsNotEmpty()
  routeName!: string

  @IsDateString()
  startDate!: string

  @IsDateString()
  endDate!: string

  @IsString()
  @IsNotEmpty()
  ownerUserId!: string

  @IsOptional()
  @IsEnum(PrismaDepartureType)
  departureType?: PrismaDepartureType

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsString()
  templateId?: string

  @IsOptional()
  @IsString()
  driverSupplierId?: string | null

  @IsOptional()
  @IsString()
  guideSupplierId?: string | null

  @IsOptional()
  @IsString()
  vehiclePlate?: string | null

  @IsOptional()
  @IsString()
  contactPhone?: string | null
}

export class ListDeparturesQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsEnum(PrismaDepartureStatus)
  status?: PrismaDepartureStatus

  @IsOptional()
  @IsDateString()
  startDateFrom?: string

  @IsOptional()
  @IsDateString()
  startDateTo?: string

  @IsOptional()
  @IsString()
  routeName?: string

  @IsOptional()
  @IsEnum(PrismaDepartureType)
  departureType?: PrismaDepartureType

  @IsOptional()
  @IsIn(Object.values(DepartureProgress))
  departureProgress?: DepartureProgress

  @IsOptional()
  @IsString()
  ownerUserId?: string

  @IsOptional()
  @IsString()
  partnerId?: string

  @IsOptional()
  @IsIn(['in_progress', 'next_7_days', 'current_and_next_7_days'])
  operationalWindow?: DepartureOperationalWindow

  @IsOptional()
  @IsIn(['any'])
  departureDataGap?: 'any'

  @IsOptional()
  @IsIn(['ready'])
  settlementReadiness?: 'ready'

  /** 工作台「待提交账款」下钻：筛选仍有应收/应付生成缺口的发团。 */
  @IsOptional()
  @IsIn(['any', 'payable', 'receivable'])
  accountGenerationGap?: 'any' | 'payable' | 'receivable'

  /** 与工作台运营指标对齐：排除已关闭发团。值为 `1`。 */
  @IsOptional()
  @IsIn(['1'])
  excludeClosed?: '1'

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

/** Query for GET /departures/route-ledger (#183 / #221)。业务门槛见 assertRouteLedgerQueryAxes。 */
export class ListRouteLedgerQueryDto {
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value
    }
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  })
  @IsOptional()
  @IsString()
  routeName?: string

  @IsOptional()
  @IsDateString()
  startDateFrom?: string

  @IsOptional()
  @IsDateString()
  startDateTo?: string
}

export class UpdateDepartureDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  routeName?: string

  @IsOptional()
  @IsEnum(PrismaDepartureType)
  departureType?: PrismaDepartureType

  @IsOptional()
  @IsDateString()
  startDate?: string

  @IsOptional()
  @IsDateString()
  endDate?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ownerUserId?: string

  @IsOptional()
  @IsString()
  notes?: string | null

  @IsOptional()
  @IsString()
  driverSupplierId?: string | null

  @IsOptional()
  @IsString()
  guideSupplierId?: string | null

  @IsOptional()
  @IsString()
  vehiclePlate?: string | null

  @IsOptional()
  @IsString()
  contactPhone?: string | null
}

export class TransitionDepartureDto {
  @IsEnum(PrismaDepartureStatus)
  targetStatus!: PrismaDepartureStatus
}

export class CloseDepartureDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: '归档原因不能为空' })
  reason!: string
}

export class UnarchiveDepartureDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: '解除归档原因不能为空' })
  reason!: string
}

export class CopyDepartureDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsDateString()
  startDate!: string

  @IsDateString()
  endDate!: string

  @IsString()
  @IsNotEmpty()
  ownerUserId!: string

  @IsOptional()
  @IsEnum(PrismaDepartureType)
  departureType?: PrismaDepartureType

  @IsOptional()
  @IsString()
  notes?: string
}

export class RegisterDepartureAttachmentDto {
  @IsString()
  @IsNotEmpty()
  sourceId!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  parseVersion!: number
}
