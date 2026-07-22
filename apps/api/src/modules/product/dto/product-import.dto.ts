import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator'

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export class ConfirmImportScheduleDto {
  @IsString()
  dateRuleText!: string

  @IsOptional()
  @IsString()
  title?: string

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

export class ConfirmImportLineDto {
  @IsString()
  @IsNotEmpty()
  candidateKey!: string

  @IsIn(['accept', 'skip'])
  action!: 'accept' | 'skip'

  @ValidateIf((dto: ConfirmImportLineDto) => dto.action === 'accept')
  @IsString()
  @IsNotEmpty()
  name?: string

  @ValidateIf((dto: ConfirmImportLineDto) => dto.action === 'accept')
  @IsString()
  @IsNotEmpty()
  shortItinerary?: string

  @IsOptional()
  @IsString()
  featuresText?: string | null

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  @ValidateIf((dto: ConfirmImportLineDto) => dto.action === 'accept')
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConfirmImportScheduleDto)
  schedules?: ConfirmImportScheduleDto[]
}

export class ConfirmProductImportSessionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConfirmImportLineDto)
  lines!: ConfirmImportLineDto[]
}
