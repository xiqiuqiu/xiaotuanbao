import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
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
import { Transform, Type } from 'class-transformer'
import { DepartureCreationDraftMode, DepartureType } from '@xiaotuanbao/shared'
import { CONVERSATION_TEXT_MAX_CHARS } from '../ai-conversation.constants'

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
  conversationId?: string

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
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  decisionCommandId?: string

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

export class CancelAiReviewPackageDto {
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
  @MaxLength(CONVERSATION_TEXT_MAX_CHARS, {
    message: `消息内容不能超过 ${CONVERSATION_TEXT_MAX_CHARS} 个字符`,
  })
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

  @IsOptional()
  @IsObject()
  pageLocator?: Record<string, unknown>

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  primaryTaskId?: string
}

export class SaveAiConversationTextDraftDto {
  @IsString()
  @MaxLength(CONVERSATION_TEXT_MAX_CHARS, {
    message: `草稿内容不能超过 ${CONVERSATION_TEXT_MAX_CHARS} 个字符`,
  })
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
}

export class ListAgentConversationsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeArchived?: boolean

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cursor?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number
}
