import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator'
import { Type, Transform } from 'class-transformer'
import {
  DirectoryProfileStatus,
  InvoiceAvailable,
  InvoiceType,
  SettlementCycle,
  SettlementMethod,
  SupplierCategory,
} from '@prisma/client'

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsEnum(SupplierCategory)
  category!: SupplierCategory

  @IsOptional()
  @IsString()
  contactName?: string

  @IsOptional()
  @IsString()
  contactPhone?: string

  @IsOptional()
  @IsEnum(SettlementMethod)
  settlementMethod?: SettlementMethod

  @IsOptional()
  @IsEnum(SettlementCycle)
  settlementCycle?: SettlementCycle

  @IsOptional()
  @IsString()
  settlementNotes?: string

  @IsOptional()
  @IsString()
  referenceQuoteNotes?: string

  @IsOptional()
  @IsEnum(InvoiceAvailable)
  invoiceAvailable?: InvoiceAvailable

  @IsOptional()
  @IsEnum(InvoiceType)
  invoiceType?: InvoiceType

  @IsOptional()
  @IsString()
  taxRate?: string

  @IsOptional()
  @IsString()
  accountName?: string

  @IsOptional()
  @IsString()
  bankName?: string

  @IsOptional()
  @IsString()
  bankAccount?: string

  @IsOptional()
  @IsString()
  businessNotes?: string
}

const EDITABLE_SUPPLIER_STATUSES = [
  DirectoryProfileStatus.active,
  DirectoryProfileStatus.disabled,
] as const

export class UpdateSupplierDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsEnum(SupplierCategory)
  category!: SupplierCategory

  @IsIn(EDITABLE_SUPPLIER_STATUSES)
  status!: (typeof EDITABLE_SUPPLIER_STATUSES)[number]

  @IsOptional()
  @IsString()
  contactName?: string

  @IsOptional()
  @IsString()
  contactPhone?: string

  @IsOptional()
  @IsEnum(SettlementMethod)
  settlementMethod?: SettlementMethod

  @IsOptional()
  @IsEnum(SettlementCycle)
  settlementCycle?: SettlementCycle

  @IsOptional()
  @IsString()
  settlementNotes?: string

  @IsOptional()
  @IsString()
  referenceQuoteNotes?: string

  @IsOptional()
  @IsEnum(InvoiceAvailable)
  invoiceAvailable?: InvoiceAvailable

  @IsOptional()
  @IsEnum(InvoiceType)
  invoiceType?: InvoiceType

  @IsOptional()
  @IsString()
  taxRate?: string

  @IsOptional()
  @IsString()
  accountName?: string

  @IsOptional()
  @IsString()
  bankName?: string

  @IsOptional()
  @IsString()
  bankAccount?: string

  @IsOptional()
  @IsString()
  businessNotes?: string
}

export class ListSuppliersQueryDto {
  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsEnum(SupplierCategory)
  category?: SupplierCategory

  @IsOptional()
  @IsEnum(DirectoryProfileStatus)
  status?: DirectoryProfileStatus

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
