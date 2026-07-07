import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class CreateItinerarySegmentDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsString()
  @IsNotEmpty()
  startDate!: string

  @IsString()
  @IsNotEmpty()
  endDate!: string

  @IsString()
  @IsNotEmpty()
  destination!: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  applicableGuestCount?: number

  @IsOptional()
  @IsString()
  notes?: string
}

export class UpdateItinerarySegmentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  startDate?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  endDate?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  destination?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  applicableGuestCount?: number

  @IsOptional()
  @IsString()
  notes?: string | null
}
