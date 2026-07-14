const businessDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function formatBusinessDateTime(value: string | null | undefined): string {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  const parts = businessDateTimeFormatter.formatToParts(date).reduce<Record<string, string>>(
    (result, part) => {
      if (part.type !== 'literal') {
        result[part.type] = part.value
      }
      return result
    },
    {},
  )

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}
