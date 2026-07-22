import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class StoredObjectIdParam {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  id!: string
}
