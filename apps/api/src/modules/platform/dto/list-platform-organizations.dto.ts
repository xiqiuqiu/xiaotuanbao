import { Type } from 'class-transformer'
import { IsInt, IsOptional, Min } from 'class-validator'

export class ListPlatformOrganizationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number
}
