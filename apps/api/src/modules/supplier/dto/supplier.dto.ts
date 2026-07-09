import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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
  ResourceKind,
  SettlementCycle,
  SettlementMethod,
} from '@prisma/client'
import {
  SUPPLIER_ALLOWED_RESOURCE_KINDS,
  type SupplierAllowedResourceKind,
} from '@xiaotuanbao/shared'

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsArray()
  @ArrayMinSize(1, { message: '供应商类别不能为空' })
  @ArrayUnique()
  @IsEnum(ResourceKind, { each: true })
  @IsIn([...SUPPLIER_ALLOWED_RESOURCE_KINDS], {
    each: true,
    message: '拼出不得作为供应商类别',
  })
  categories!: SupplierAllowedResourceKind[]

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

  @IsArray()
  @ArrayMinSize(1, { message: '供应商类别不能为空' })
  @ArrayUnique()
  @IsEnum(ResourceKind, { each: true })
  @IsIn([...SUPPLIER_ALLOWED_RESOURCE_KINDS], {
    each: true,
    message: '拼出不得作为供应商类别',
  })
  categories!: SupplierAllowedResourceKind[]

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

  /** Filter suppliers whose categories contain this ResourceKind. */
  @IsOptional()
  @IsEnum(ResourceKind)
  @IsIn([...SUPPLIER_ALLOWED_RESOURCE_KINDS])
  category?: SupplierAllowedResourceKind

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
