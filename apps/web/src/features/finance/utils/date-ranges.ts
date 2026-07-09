import dayjs from 'dayjs'

export type TransactionDateRange = [string | undefined, string | undefined] | null
export type VerificationDateRange = [string | undefined, string | undefined] | null

export function getDefaultTransactionDateRange(): [string, string] {
  return [dayjs().subtract(30, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]
}

export function getDefaultVerificationDateRange(): [string, string] {
  return [dayjs().subtract(30, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]
}
