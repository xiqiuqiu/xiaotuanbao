import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import {
  FareAdjustmentDirection as PrismaFareAdjustmentDirection,
  FareAdjustmentKind as PrismaFareAdjustmentKind,
  GuestGender as PrismaGuestGender,
  SourceOrderCollectionMode as PrismaCollectionMode,
  SourceOrderDiscountType as PrismaDiscountType,
} from '@prisma/client'

export class ListPartnerSourceOrdersQueryDto {
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

export class ListSourceOrdersQueryDto {
  @IsOptional()
  @IsString()
  partnerId?: string

  @IsOptional()
  @IsEnum(PrismaCollectionMode)
  collectionMode?: PrismaCollectionMode

  @IsOptional()
  @IsIn(['all', 'yes', 'no'])
  hasDiscount?: 'all' | 'yes' | 'no'

  @IsOptional()
  @IsString()
  keyword?: string
}

export class ListPendingReceivableSourceOrdersQueryDto {
  @IsIn(['not_generated'])
  receivableGeneration!: 'not_generated'

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

export class SourceOrderFareAdjustmentDto {
  @IsEnum(PrismaFareAdjustmentKind)
  kind!: PrismaFareAdjustmentKind

  @IsEnum(PrismaFareAdjustmentDirection)
  direction!: PrismaFareAdjustmentDirection

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents!: number

  @IsOptional()
  @IsString()
  customName?: string | null
}

export class CreateSourceOrderDto {
  @IsString()
  @IsNotEmpty()
  partnerId!: string

  @Type(() => Number)
  @IsInt()
  @Min(0)
  adultGuestCount!: number

  @Type(() => Number)
  @IsInt()
  @Min(0)
  childGuestCount!: number

  /** Required by domain when adultGuestCount > 0; optional when count is 0. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  adultUnitPriceCents?: number | null

  /** Required by domain when childGuestCount > 0; optional when count is 0. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  childUnitPriceCents?: number | null

  @IsEnum(PrismaDiscountType)
  discountType!: PrismaDiscountType

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountCents?: number

  @IsOptional()
  @IsString()
  discountNotes?: string

  @IsEnum(PrismaCollectionMode)
  collectionMode!: PrismaCollectionMode

  /** 定金（分）；代收场景录入。 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  depositCents?: number

  /** 尾款（分）；代收场景录入。 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  balanceCents?: number

  @IsOptional()
  @IsString()
  settlementNotes?: string

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SourceOrderFareAdjustmentDto)
  fareAdjustments?: SourceOrderFareAdjustmentDto[]
}

export class UpdateSourceOrderDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  partnerId?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  adultGuestCount?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  childGuestCount?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  adultUnitPriceCents?: number | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  childUnitPriceCents?: number | null

  @IsOptional()
  @IsEnum(PrismaDiscountType)
  discountType?: PrismaDiscountType

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountCents?: number

  @IsOptional()
  @IsString()
  discountNotes?: string | null

  @IsOptional()
  @IsEnum(PrismaCollectionMode)
  collectionMode?: PrismaCollectionMode

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  depositCents?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  balanceCents?: number

  @IsOptional()
  @IsString()
  settlementNotes?: string | null

  @IsOptional()
  @IsString()
  notes?: string | null

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SourceOrderFareAdjustmentDto)
  fareAdjustments?: SourceOrderFareAdjustmentDto[]
}

export class CreateSourceOrderGuestDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsEnum(PrismaGuestGender)
  gender?: PrismaGuestGender

  @IsOptional()
  @IsString()
  notes?: string
}

export class UpdateSourceOrderGuestDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string

  @IsOptional()
  @IsString()
  phone?: string | null

  @IsOptional()
  @IsEnum(PrismaGuestGender)
  gender?: PrismaGuestGender

  @IsOptional()
  @IsString()
  notes?: string | null
}

export class SettleByActualCollectionDto {
  /** 未结清游客代收时仍办理按实收结算。 */
  @IsOptional()
  @IsBoolean()
  earlySettle?: boolean
}
