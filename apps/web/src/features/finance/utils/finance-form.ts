import dayjs, { type Dayjs } from 'dayjs'

export function yuanToCents(yuan: number): number {
  return Math.round(yuan * 100)
}

export function centsToYuan(cents: number): number {
  return cents / 100
}

export function dayjsToDateString(value: Dayjs | null | undefined): string {
  return value ? value.format('YYYY-MM-DD') : ''
}

export function dateStringToDayjs(value: string | null | undefined): Dayjs | null {
  return value ? dayjs(value) : null
}
