export function canMutateFinance(menuKeys: string[]): boolean {
  return menuKeys.includes('/finance/receivable')
}
