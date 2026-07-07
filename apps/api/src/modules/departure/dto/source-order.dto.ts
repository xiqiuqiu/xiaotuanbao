import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator'
import { Type } from 'class-transformer'
import {
  GuestGender as PrismaGuestGender,
  SourceOrderCollectionMode as PrismaCollectionMode,
  SourceOrderDiscountType as PrismaDiscountType,
} from '@prisma/client'

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

export class CreateSourceOrderDto {
  @IsString()
  @IsNotEmpty()
  partnerId!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  guestCount!: number

  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPriceCents!: number

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  partnerCollectedCents?: number

  @IsOptional()
  @IsString()
  settlementNotes?: string

  @IsOptional()
  @IsString()
  notes?: string
}

export class UpdateSourceOrderDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  partnerId?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guestCount?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPriceCents?: number

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
  partnerCollectedCents?: number

  @IsOptional()
  @IsString()
  settlementNotes?: string | null

  @IsOptional()
  @IsString()
  notes?: string | null
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
