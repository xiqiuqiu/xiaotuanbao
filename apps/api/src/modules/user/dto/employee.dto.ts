import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator'
import { Type } from 'class-transformer'
import { UserStatus } from '@prisma/client'

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  username!: string

  @IsString()
  @IsNotEmpty()
  name!: string

  @IsOptional()
  @IsString()
  remark?: string

  @IsString()
  @IsNotEmpty()
  roleId!: string

  @IsEnum(UserStatus)
  status!: UserStatus

  @IsString()
  @MinLength(8)
  password!: string
}

export class UpdateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  username!: string

  @IsString()
  @IsNotEmpty()
  name!: string

  @IsOptional()
  @IsString()
  remark?: string

  @IsString()
  @IsNotEmpty()
  roleId!: string

  @IsEnum(UserStatus)
  status!: UserStatus
}

export class ListEmployeesQueryDto {
  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus

  @IsOptional()
  @IsString()
  roleId?: string

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
