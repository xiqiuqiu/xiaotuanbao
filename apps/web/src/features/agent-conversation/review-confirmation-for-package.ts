import type { ReviewConfirmationView } from '@/types/api'

export function confirmationForPackage(
  confirmations: readonly ReviewConfirmationView[],
  packageId: string,
) {
  const items = confirmations.flatMap((confirmation) =>
    confirmation.items.filter((item) => item.packageId === packageId),
  )
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]?.status === 'succeeded') {
      return items[index]
    }
  }
  return items.at(-1)
}
