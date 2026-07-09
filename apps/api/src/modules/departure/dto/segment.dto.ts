import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

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
  @IsString()
  notes?: string | null
}
