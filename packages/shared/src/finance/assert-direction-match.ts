export class DirectionMismatchError extends Error {
  constructor(message = '流水方向与节点类型不匹配') {
    super(message)
    this.name = 'DirectionMismatchError'
  }
}

export function assertDirectionMatch(
  scheduleDirection: string,
  transactionDirection: string,
): void {
  const expected =
    scheduleDirection === 'receivable'
      ? 'inflow'
      : scheduleDirection === 'payable'
        ? 'outflow'
        : null

  if (!expected || transactionDirection !== expected) {
    throw new DirectionMismatchError('流水方向与节点类型不匹配')
  }
}
