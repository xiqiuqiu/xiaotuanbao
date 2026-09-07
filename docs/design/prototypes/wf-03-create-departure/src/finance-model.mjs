// ponytail: one-departure in-memory demo; real integration must use server finance contracts.
export function balance(schedule, verifications) {
  return Math.round(schedule.amount * 100 - verifications.filter(v => v.scheduleId === schedule.id).reduce((sum, v) => sum + Math.round(v.amount * 100), 0)) / 100;
}
export function available(transaction, verifications) {
  return Math.round(transaction.amount * 100 - verifications.filter(v => v.transactionId === transaction.id).reduce((sum, v) => sum + Math.round(v.amount * 100), 0)) / 100;
}
export function canVerify(schedule, transaction, verifications, amount) {
  return !!schedule && !!transaction && schedule.direction === transaction.direction && schedule.partner === transaction.partner && Number.isFinite(amount) && amount > 0 && amount <= balance(schedule, verifications) && amount <= available(transaction, verifications);
}
