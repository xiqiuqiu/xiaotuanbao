import { Type } from 'class-transformer'
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator'

export class CreateGroundIncomeDto {
  @IsString()
  @IsNotEmpty()
  title!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents!: number
}

export class UpdateGroundIncomeDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents?: number
}
