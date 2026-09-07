// Shared business facts for the page and the prototype assistant.
export function businessFacts(source, groups, manualRows) {
  const resources = [...groups.filter(group => group.written), ...manualRows];
  return {
    resources,
    costs: resources.reduce((sum, group) => sum + Math.round(group.amount * 100), 0) / 100,
    guestCount: source ? source.adults + source.children : 0,
    receivable: source ? (source.adults * Math.round(source.adultPrice * 100) + source.children * Math.round(source.childPrice * 100) + Math.round(source.adjustment * 100) - Math.round(source.discount * 100)) / 100 : 0,
  };
}
