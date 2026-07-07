import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator'
import { Type, Transform } from 'class-transformer'
import {
  PartnerContactRole,
  PartnerKind,
  PartnerType,
  SettlementCycle,
  SettlementMethod,
} from '@prisma/client'

export class CreatePartnerDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsEnum(PartnerKind)
  partnerKind!: PartnerKind

  @IsEnum(PartnerType)
  partnerType!: PartnerType

  @IsOptional()
  @IsString()
  contactName?: string

  @IsOptional()
  @IsEnum(PartnerContactRole)
  contactRole?: PartnerContactRole

  @IsOptional()
  @IsString()
  contactPhone?: string

  @IsOptional()
  @IsEnum(SettlementMethod)
  settlementMethod?: SettlementMethod

  @IsOptional()
  @IsEnum(SettlementCycle)
  paymentTermRule?: SettlementCycle

  @IsOptional()
  @IsString()
  settlementNotes?: string
}

export class ListPartnersQueryDto {
  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeArchived?: boolean

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
