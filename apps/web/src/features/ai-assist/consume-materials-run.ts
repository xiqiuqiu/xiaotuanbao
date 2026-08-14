export function canStartConsumeRun({
  consumeKey,
  firstTurnSent,
  alreadySent,
  isRunning,
}: {
  consumeKey?: string | null
  firstTurnSent: boolean
  alreadySent: boolean
  isRunning: boolean
}): boolean {
  return Boolean(consumeKey) && firstTurnSent && !alreadySent && !isRunning
}
