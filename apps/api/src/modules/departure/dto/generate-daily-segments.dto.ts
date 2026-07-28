import { IsIn, IsOptional } from 'class-validator'
import type { GenerateDailySegmentsMode } from '@xiaotuanbao/shared'

const GENERATE_DAILY_MODES = ['fill_missing', 'rebuild_empty'] as const satisfies readonly GenerateDailySegmentsMode[]

export class GenerateDailySegmentsDto {
  @IsOptional()
  @IsIn(GENERATE_DAILY_MODES)
  mode?: GenerateDailySegmentsMode
}
