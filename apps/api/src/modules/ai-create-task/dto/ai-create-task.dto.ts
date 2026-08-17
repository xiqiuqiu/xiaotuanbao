import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
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

export class StartAiCreateAssistSessionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  taskId?: string

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DepartureCreationDraftSnapshotDto)
  draft?: DepartureCreationDraftSnapshotDto
}

export class ConfirmAiReviewPackageDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedPackageVersion!: number

  @IsOptional()
  @IsObject()
  corrections?: Record<string, string | number | null>
}

export class RejectAiReviewPackageDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedPackageVersion!: number
}

export class PatchAiReviewPackageDto {
  @IsObject()
  corrections!: Record<string, string | number | null>
}

export class SendAiConversationMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  text?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  replyToEventId?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  interactionId?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  interactionVersion?: number

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  selectedOptionId?: string
}

export class SaveAiConversationTextDraftDto {
  @IsString()
  @MaxLength(8000)
  text!: string

  @Type(() => Number)
  @IsInt()
  @Min(0)
  draftEpoch!: number
}

export class CancelAiConversationInteractionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number
}

export class RetryFailedMaterialsDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  materialIds?: string[]
}

export class RemoveBatchMaterialsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  materialIds!: string[]
}

export class ListAiConversationEventsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  afterSequence?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number
}
