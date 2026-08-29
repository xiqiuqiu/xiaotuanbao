export const ROUTE_TEMPLATE_DAY_COUNT_MISMATCH = 'ROUTE_TEMPLATE_DAY_COUNT_MISMATCH' as const

export interface RouteTemplateDayCountMismatch {
  code: typeof ROUTE_TEMPLATE_DAY_COUNT_MISMATCH
  templateDayCount: number
  tourDayCount: number
  startDate: string
  endDate: string
}

export class RouteTemplateDayCountMismatchError
  extends Error
  implements RouteTemplateDayCountMismatch
{
  readonly code = ROUTE_TEMPLATE_DAY_COUNT_MISMATCH

  constructor(
    readonly templateDayCount: number,
    readonly tourDayCount: number,
    readonly startDate: string,
    readonly endDate: string,
  ) {
    super(
      formatRouteTemplateDayCountMismatch({
        code: ROUTE_TEMPLATE_DAY_COUNT_MISMATCH,
        templateDayCount,
        tourDayCount,
        startDate,
        endDate,
      }),
    )
    this.name = 'RouteTemplateDayCountMismatchError'
  }
}

export function formatRouteTemplateDayCountMismatch(
  conflict: RouteTemplateDayCountMismatch,
): string {
  return (
    `常用路线为 ${conflict.templateDayCount} 天，与所选团期 ${conflict.tourDayCount} 天` +
    `（${conflict.startDate}～${conflict.endDate}）不一致。请调整常用路线或团期后再创建，系统不会自动改结束日。`
  )
}

export function assertRouteTemplateMatchesTourPeriod(input: {
  templateDayCount: number
  tourDayCount: number
  startDate: string
  endDate: string
}): void {
  if (input.templateDayCount === input.tourDayCount) {
    return
  }

  throw new RouteTemplateDayCountMismatchError(
    input.templateDayCount,
    input.tourDayCount,
    input.startDate,
    input.endDate,
  )
}
