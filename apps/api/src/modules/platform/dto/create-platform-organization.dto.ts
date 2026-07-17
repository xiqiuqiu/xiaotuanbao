import { Transform } from 'class-transformer'
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class CreatePlatformOrganizationDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: '组织名称不能为空' })
  @MaxLength(100, { message: '组织名称不能超过 100 个字符' })
  name!: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: '组织业务前缀不能为空' })
  @Matches(/^[A-Z]{2,4}$/, {
    message: '组织业务前缀须为 2–4 位大写英文字母',
  })
  businessPrefix!: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: '登录用户名不能为空' })
  @MaxLength(100, { message: '登录用户名不能超过 100 个字符' })
  adminUsername!: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: '显示名称不能为空' })
  @MaxLength(100, { message: '显示名称不能超过 100 个字符' })
  adminName!: string

  @IsString()
  @MinLength(8, { message: '初始密码至少 8 位' })
  adminPassword!: string
}
