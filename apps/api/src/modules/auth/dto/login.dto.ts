import { IsNotEmpty, IsString, MinLength } from 'class-validator'

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: '请输入用户名' })
  username!: string

  @IsString()
  @IsNotEmpty({ message: '请输入密码' })
  @MinLength(4, { message: '密码长度不能少于 4 位' })
  password!: string
}
