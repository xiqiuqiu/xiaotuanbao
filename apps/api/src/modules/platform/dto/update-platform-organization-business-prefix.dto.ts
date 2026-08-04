import { Transform } from 'class-transformer'
import { IsNotEmpty, IsString, Matches } from 'class-validator'

export class UpdatePlatformOrganizationBusinessPrefixDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsNotEmpty({ message: '组织业务前缀不能为空' })
  @Matches(/^[A-Z]{1,4}$/, {
    message: '组织业务前缀须为 1–4 位大写英文字母',
  })
  businessPrefix!: string
}
