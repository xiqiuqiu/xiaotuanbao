import { Type } from 'class-transformer'
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator'
import {
  CounterpartyType,
  ResourceKind,
} from '@prisma/client'

export class ListRouteTemplatesQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string
}

export class CreateRouteTemplateResourceDto {
  @IsEnum(ResourceKind)
  resourceKind!: ResourceKind

  @IsEnum(CounterpartyType)
  counterpartyType!: CounterpartyType

  @IsOptional()
  @IsString()
  partnerId?: string

  @IsOptional()
  @IsString()
  supplierId?: string

  @IsString()
  @IsNotEmpty()
  title!: string

  @IsInt()
  @Min(0)
  amountCents!: number

  @IsOptional()
  @IsString()
  notes?: string
}

export class CreateRouteTemplateSegmentDto {
  @IsInt()
  @Min(0)
  sortOrder!: number

  @IsString()
  @IsNotEmpty()
  name!: string

  @IsInt()
  @Min(1)
  dayCount!: number

  @IsOptional()
  @IsString()
  destination?: string

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRouteTemplateResourceDto)
  resources?: CreateRouteTemplateResourceDto[]
}

export class CreateRouteTemplateDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsInt()
  @Min(1)
  defaultDayCount!: number

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRouteTemplateSegmentDto)
  segments?: CreateRouteTemplateSegmentDto[]
}

export interface RouteTemplateCopyFlags {
  copySegments?: boolean
  copyResources?: boolean
  copyReferencePrices?: boolean
}
