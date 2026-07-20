import { Type } from 'class-transformer'
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator'
import { ResourceKind as PrismaResourceKind } from '@prisma/client'
import { SegmentPayableStatus } from '@xiaotuanbao/shared'

export class ListSegmentResourcesQueryDto {
  @IsOptional()
  @IsEnum(PrismaResourceKind)
  resourceKind?: PrismaResourceKind

  @IsOptional()
  @IsEnum(SegmentPayableStatus)
  payableStatus?: SegmentPayableStatus

  @IsOptional()
  @IsString()
  keyword?: string
}

/** 供应商服务团单 Tab：按出团日期区间过滤＋分页跨发团查询该供应商的非拼出资源行。 */
export class ListSupplierServiceOrdersQueryDto {
  @IsOptional()
  @IsDateString()
  departureDateFrom?: string

  @IsOptional()
  @IsDateString()
  departureDateTo?: string

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

export class CreateSegmentResourceDto {
  @IsEnum(PrismaResourceKind)
  resourceKind!: PrismaResourceKind

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  partnerId?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  supplierId?: string

  @IsOptional()
  @IsString()
  title?: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents!: number

  @IsOptional()
  @IsString()
  notes?: string
}

export class UpdateSegmentResourceDto {
  @IsOptional()
  @IsEnum(PrismaResourceKind)
  resourceKind?: PrismaResourceKind

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  partnerId?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  supplierId?: string

  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents?: number

  @IsOptional()
  @IsString()
  notes?: string | null
}
