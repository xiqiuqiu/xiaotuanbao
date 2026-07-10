import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class CreateItinerarySegmentDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  startDate?: string | null

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  endDate?: string | null

  @IsOptional()
  @IsString()
  destination?: string | null

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
  startDate?: string | null

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  endDate?: string | null

  @IsOptional()
  @IsString()
  destination?: string | null

  @IsOptional()
  @IsString()
  notes?: string | null
}
