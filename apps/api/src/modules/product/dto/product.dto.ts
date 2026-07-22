import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator'
import { Type, Transform } from 'class-transformer'
import { ProductScheduleStatus, ProductStatus } from '@prisma/client'

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsOptional()
  @IsString()
  shortItinerary?: string

  @IsOptional()
  @IsString()
  startCity?: string

  @IsOptional()
  @IsString()
  endCity?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dayCount?: number

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string

  @IsOptional()
  @IsString()
  shortItinerary?: string

  @IsOptional()
  @IsString()
  detailedItinerary?: string | null

  @IsOptional()
  @IsString()
  bookingNotice?: string | null

  @IsOptional()
  @IsString()
  startCity?: string | null

  @IsOptional()
  @IsString()
  endCity?: string | null

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dayCount?: number | null

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus
}

export class UpdateProductSpecDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  adultPriceCents?: number | null

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  childPriceCents?: number | null

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  singleRoomSupplementCents?: number | null

  @IsOptional()
  @IsString()
  notes?: string | null
}

export class CreateProductScheduleDto {
  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @IsString()
  dateRuleText?: string

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  @Matches(DATE_ONLY)
  startDate?: string | null

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  @Matches(DATE_ONLY)
  endDate?: string | null

  @IsOptional()
  @IsEnum(ProductScheduleStatus)
  status?: ProductScheduleStatus

  @IsOptional()
  @IsBoolean()
  priceOnInquiry?: boolean

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  adultPriceCents?: number | null

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  childPriceCents?: number | null

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  singleRoomSupplementCents?: number | null

  @IsOptional()
  @IsString()
  notes?: string | null
}

export class UpdateProductScheduleDto {
  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @IsString()
  dateRuleText?: string

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  @Matches(DATE_ONLY)
  startDate?: string | null

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  @Matches(DATE_ONLY)
  endDate?: string | null

  @IsOptional()
  @IsEnum(ProductScheduleStatus)
  status?: ProductScheduleStatus

  @IsOptional()
  @IsBoolean()
  priceOnInquiry?: boolean

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  adultPriceCents?: number | null

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  childPriceCents?: number | null

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  singleRoomSupplementCents?: number | null

  @IsOptional()
  @IsString()
  notes?: string | null
}

export class ProductFeatureItemDto {
  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @IsString()
  description?: string
}

export class ReplaceProductFeaturesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductFeatureItemDto)
  features!: ProductFeatureItemDto[]
}

export class ApplyBookingNoticeTemplateDto {
  @IsString()
  @IsNotEmpty()
  templateId!: string
}

export class CreateBookingNoticeTemplateDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsString()
  @IsNotEmpty()
  content!: string
}

export class UpdateBookingNoticeTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  content?: string
}

export class ListProductsQueryDto {
  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus

  /** 按 Product Import Session 筛选。 */
  @IsOptional()
  @IsString()
  importSessionId?: string

  /** 按来源 Sheet 名筛选。 */
  @IsOptional()
  @IsString()
  sourceSheetName?: string

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

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeOffline?: boolean
}
