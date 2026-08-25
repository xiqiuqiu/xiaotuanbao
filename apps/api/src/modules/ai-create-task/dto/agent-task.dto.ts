import { Type } from 'class-transformer'
import { IsIn, IsInt, IsString, Min } from 'class-validator'

export class LinkAgentTaskConversationDto {
  @IsString()
  @IsIn(['created', 'continued', 'referenced'])
  linkReason!: 'created' | 'continued' | 'referenced'
}

export class CloseAgentTaskDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedStatusVersion!: number
}
