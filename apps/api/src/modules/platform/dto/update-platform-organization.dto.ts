import { Transform } from 'class-transformer'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class UpdatePlatformOrganizationDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: '组织名称不能为空' })
  @MaxLength(100, { message: '组织名称不能超过 100 个字符' })
  name!: string
}
