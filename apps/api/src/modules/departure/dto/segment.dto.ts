import { Type } from 'class-transformer'
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator'

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

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '票型人数须为非负整数' })
  @Min(0, { message: '票型人数须为非负整数' })
  fullTicketCount?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '票型人数须为非负整数' })
  @Min(0, { message: '票型人数须为非负整数' })
  halfTicketCount?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '票型人数须为非负整数' })
  @Min(0, { message: '票型人数须为非负整数' })
  studentTicketCount?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '票型人数须为非负整数' })
  @Min(0, { message: '票型人数须为非负整数' })
  freeTicketCount?: number
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

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '票型人数须为非负整数' })
  @Min(0, { message: '票型人数须为非负整数' })
  fullTicketCount?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '票型人数须为非负整数' })
  @Min(0, { message: '票型人数须为非负整数' })
  halfTicketCount?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '票型人数须为非负整数' })
  @Min(0, { message: '票型人数须为非负整数' })
  studentTicketCount?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '票型人数须为非负整数' })
  @Min(0, { message: '票型人数须为非负整数' })
  freeTicketCount?: number
}
