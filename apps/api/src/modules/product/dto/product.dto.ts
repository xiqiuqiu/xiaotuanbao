import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator'
import { Type, Transform } from 'class-transformer'
import { ProductScheduleStatus, ProductStatus } from '@prisma/client'

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsOptional()
  @IsString()
  shortItinerary?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  @IsOptional()
  @IsString()
  departureCity?: string

  @IsOptional()
  @IsString()
  arrivalCity?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dayCount?: number
}

export class UpdateProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsOptional()
  @IsString()
  shortItinerary?: string | null

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  @IsOptional()
  @IsString()
  departureCity?: string | null

  @IsOptional()
  @IsString()
  arrivalCity?: string | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dayCount?: number | null
}

export class UpdateProductSpecDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  adultPriceCents?: number | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  childPriceCents?: number | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  singleSupplementCents?: number | null
}

export class CreateProductScheduleDto {
  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  dateRuleText?: string

  @IsOptional()
  @IsDateString()
  dateRangeStart?: string

  @IsOptional()
  @IsDateString()
  dateRangeEnd?: string

  /** 若省略，则从规格默认价快照；显式传入可覆盖。 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  adultPriceCents?: number | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  childPriceCents?: number | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  singleSupplementCents?: number | null

  @IsOptional()
  @IsBoolean()
  inquireOnly?: boolean

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsEnum(ProductScheduleStatus)
  status?: ProductScheduleStatus
}

export class UpdateProductScheduleDto {
  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  dateRuleText?: string | null

  @IsOptional()
  @IsDateString()
  dateRangeStart?: string | null

  @IsOptional()
  @IsDateString()
  dateRangeEnd?: string | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  adultPriceCents?: number | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  childPriceCents?: number | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  singleSupplementCents?: number | null

  @IsOptional()
  @IsBoolean()
  inquireOnly?: boolean

  @IsOptional()
  @IsString()
  notes?: string | null

  @IsOptional()
  @IsEnum(ProductScheduleStatus)
  status?: ProductScheduleStatus
}

export class ListProductsQueryDto {
  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeOffShelf?: boolean

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
