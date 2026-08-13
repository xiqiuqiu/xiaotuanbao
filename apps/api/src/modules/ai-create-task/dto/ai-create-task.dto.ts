import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import { DepartureCreationDraftMode, DepartureType } from '@xiaotuanbao/shared'

export class DepartureCreationDraftSnapshotDto {
  @IsEnum(DepartureCreationDraftMode)
  mode!: DepartureCreationDraftMode

  @IsString()
  routeName!: string

  @IsOptional()
  @IsString()
  templateId?: string | null

  @IsOptional()
  @IsString()
  copyFromDepartureId?: string | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  defaultDayCount?: number | null

  @IsOptional()
  @IsString()
  name?: string | null

  @IsOptional()
  @IsDateString()
  startDate?: string | null

  @IsOptional()
  @IsDateString()
  endDate?: string | null

  @IsOptional()
  @IsString()
  ownerUserId?: string | null

  @IsOptional()
  @IsEnum(DepartureType)
  departureType?: DepartureType | null

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  expectedGuestCountHint?: number | null
}

export class SaveDepartureCreationDraftDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  taskId?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion?: number

  @IsObject()
  @ValidateNested()
  @Type(() => DepartureCreationDraftSnapshotDto)
  draft!: DepartureCreationDraftSnapshotDto
}

export class ConfirmAiCreateTaskDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number
}
